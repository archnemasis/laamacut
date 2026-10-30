import type { Clip, MediaItem, Project, VideoExportSettings } from "@openreel/core";
import { clipPlaysNatively } from "./native-preview";

/** A clip the PC app can copy into the export as it is. */
export interface StreamCopyClip {
  media: MediaItem & { blob: Blob };
  durationSec: number;
}

const EPSILON = 0.02;

const isUntouched = (clip: Clip): boolean => {
  const t = clip.transform;
  const plainTransform =
    !t ||
    ((t.position?.x ?? 0) === 0 &&
      (t.position?.y ?? 0) === 0 &&
      (t.scale?.x ?? 1) === 1 &&
      (t.scale?.y ?? 1) === 1 &&
      (t.rotation ?? 0) === 0 &&
      (t.opacity ?? 1) === 1 &&
      !t.crop &&
      (t.fitMode ?? "contain") === "contain");
  return (
    plainTransform &&
    clipPlaysNatively(clip) &&
    (clip.speed ?? 1) === 1 &&
    Math.abs((clip.volume ?? 1) - 1) < 0.001 &&
    !clip.fade?.fadeIn &&
    !clip.fade?.fadeOut &&
    !(clip.automation?.volume?.length || clip.automation?.pan?.length) &&
    !clip.audioEffects.some((effect) => effect.enabled) &&
    (clip.audioTrackIndex ?? 0) === 0 &&
    // Copied video can only start on a keyframe, so clips must start at their beginning.
    clip.inPoint < EPSILON
  );
};

/**
 * Like the phone's pass-through export: when the timeline is just untouched
 * videos back to back, already at the export's size and frame rate, they can be
 * joined into the file without re-encoding. Null when anything needs rendering.
 */
export function planStreamCopy(project: Project, settings: VideoExportSettings): StreamCopyClip[] | null {
  if (settings.codec !== "h264" && settings.codec !== "h265") return null;
  if (settings.format !== "mp4" && settings.format !== "mov") return null;
  if (settings.upscaling?.enabled) return null;
  const { timeline } = project;
  if (timeline.subtitles.length > 0 || timeline.backgroundFillMode === "blur") return null;
  if ((project.textClips ?? []).length > 0 || (project.shapeClips ?? []).length > 0) return null;

  const used = timeline.tracks.filter((track) => track.clips.length > 0 && !track.hidden);
  if (used.length !== 1) return null;
  const [track] = used;
  if (track.muted || track.transitions.length > 0) return null;

  const clips = [...track.clips].sort((a, b) => a.startTime - b.startTime);
  const plan: StreamCopyClip[] = [];
  let end = 0;
  for (const clip of clips) {
    if (Math.abs(clip.startTime - end) > EPSILON) return null;
    if (!isUntouched(clip)) return null;
    const media = project.mediaLibrary.items.find((item) => item.id === clip.mediaId);
    if (!media || media.type !== "video" || !media.blob) return null;
    const { width, height, frameRate, duration } = media.metadata;
    if (width !== settings.width || height !== settings.height) return null;
    if (frameRate > settings.frameRate + 0.5) return null;
    // Whole clips only: copied video with B-frames can't stop on an exact frame either.
    if (Math.abs(clip.duration - duration) > 1 / Math.max(frameRate, 1) + EPSILON) return null;
    plan.push({ media: media as StreamCopyClip["media"], durationSec: clip.duration });
    end = clip.startTime + clip.duration;
  }
  return plan.length > 0 ? plan : null;
}

const CHUNK = 8 * 1024 * 1024;

/** Writes a clip's file to a temporary file the PC app's ffmpeg can read. */
async function writeTemp(blob: Blob, ext: string): Promise<string> {
  const fs = window.openreel!.fs;
  const tempPath = await fs.tempFilePath(ext);
  const handleId = await fs.openWrite(tempPath);
  try {
    for (let position = 0; position < blob.size; position += CHUNK) {
      await fs.writeChunk(handleId, new Uint8Array(await blob.slice(position, position + CHUNK).arrayBuffer()), position);
    }
    await fs.closeWrite(handleId);
  } catch (error) {
    await fs.abortWrite(handleId);
    throw error;
  }
  return tempPath;
}

/**
 * Tries the copy into `outPath`. False (with why, in the console) when the
 * clips turn out not to qualify, so the caller renders the export as usual.
 */
export async function tryStreamCopyExport(
  plan: readonly StreamCopyClip[],
  settings: VideoExportSettings,
  outPath: string,
  onProgress: (percent: number) => void,
): Promise<boolean> {
  const media = window.openreel?.media;
  if (!media?.streamCopyExport || !outPath) return false;
  const inputs: { path: string; durationSec: number }[] = [];
  for (const [index, clip] of plan.entries()) {
    const ext = clip.media.name.split(".").pop()?.toLowerCase() || "mp4";
    inputs.push({ path: await writeTemp(clip.media.blob, ext), durationSec: clip.durationSec });
    onProgress(((index + 1) / plan.length) * 80);
  }
  const result = await media.streamCopyExport({
    inputs,
    outPath,
    codec: settings.codec,
    width: settings.width,
    height: settings.height,
    frameRate: settings.frameRate,
  });
  if (!result.copied) console.info("[Export] Rendering instead of copying:", result.reason);
  else onProgress(100);
  return result.copied;
}
