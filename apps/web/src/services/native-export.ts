import { calculateProjectDuration, titleEngine, type Clip, type MediaItem, type Project, type TextClip, type Track, type VideoExportSettings } from "@openreel/core";
import { galleryOriginalUri } from "./gallery-originals";
import { ensureProjectFonts } from "./project-fonts";
import { findMainTrack } from "./phone-media";

/**
 * CapCut-style export on Android: the phone's decoders, GPU and encoder put
 * the video together (see ExportPlugin.java), so frames never pass through
 * the web view. Projects using something it can't do yet use the web export.
 */
export interface NativeExportPlugin {
  stageBegin(options: { ext: string }): Promise<{ uri: string }>;
  stageAppend(options: { uri: string; data: string }): Promise<void>;
  export(options: NativeExportRequest): Promise<{ uri: string; location: string }>;
  cancel(): Promise<void>;
  /** Asks for the progress notification while the app is still in front. */
  requestNotifications?(): Promise<void>;
  addListener(event: "progress", listener: (event: { progress: number }) => void): Promise<{ remove: () => Promise<void> }>;
}

export function getNativeExporter(): NativeExportPlugin | undefined {
  if (typeof window === "undefined") return undefined;
  const plugins = window.Capacitor?.Plugins as { LaamacutExport?: NativeExportPlugin } | undefined;
  return plugins?.LaamacutExport;
}

export interface NativeClip {
  /** content:// or file:// address the phone reads directly. */
  uri: string;
  kind: "video" | "image" | "audio";
  /** Photos: the phone can't always tell a gallery picture's type from its address. */
  mime?: string;
  inUs: number;
  outUs: number;
  durationUs: number;
  speed: number;
  volume: number;
  sourceFrameRate?: number;
  /** Audio tracks only: silence before this clip. */
  gapBeforeUs?: number;
}

export interface NativeExportRequest {
  width: number;
  height: number;
  frameRate: number;
  bitrate: number;
  main: NativeClip[];
  audio: NativeClip[][];
  overlays: { startUs: number; endUs: number; png: string }[];
  filename: string;
}

/** A clip whose media still has to be handed to the phone (photos, music). */
interface Pending {
  clip: NativeClip;
  media: MediaItem;
}

export interface NativeExportPlan {
  main: NativeClip[];
  audio: NativeClip[][];
  texts: TextClip[];
  pending: Pending[];
  duration: number;
}

const us = (seconds: number) => Math.round(seconds * 1_000_000);
const near = (a: number, b: number, tolerance = 0.001) => Math.abs(a - b) <= tolerance;
const MAX_STAGED_BYTES = 80 * 1024 * 1024;

/** True when a clip has nothing the native exporter can't reproduce. */
function plainClip(clip: Clip): boolean {
  const t = clip.transform;
  return (
    (clip.effects?.length ?? 0) === 0 &&
    (clip.audioEffects?.length ?? 0) === 0 &&
    (clip.keyframes?.length ?? 0) === 0 &&
    !clip.colorGrading &&
    !clip.chromaKey &&
    !clip.reversed &&
    !clip.emphasisAnimation &&
    !clip.stabilization?.enabled &&
    !clip.speedKeyframes?.length &&
    !clip.freezeFrames?.length &&
    !clip.automation?.volume?.length &&
    !clip.automation?.pan?.length &&
    !(clip.fade && (clip.fade.fadeIn > 0 || clip.fade.fadeOut > 0)) &&
    (!clip.blendMode || clip.blendMode === "normal") &&
    (clip.blendOpacity === undefined || clip.blendOpacity === 1) &&
    (!t ||
      (near(t.position.x, 0) &&
        near(t.position.y, 0) &&
        near(t.scale.x, 1) &&
        near(t.scale.y, 1) &&
        near(t.rotation, 0) &&
        near(t.opacity ?? 1, 1) &&
        !t.crop &&
        !t.rotate3d &&
        (!t.fitMode || t.fitMode === "contain" || t.fitMode === "none")))
  );
}

function plainText(text: TextClip): boolean {
  const animation = text.animation;
  return (
    (!animation || animation.preset === "none" || (animation.inDuration <= 0 && animation.outDuration <= 0)) &&
    (text.keyframes?.length ?? 0) === 0 &&
    (text.effects?.length ?? 0) === 0 &&
    !text.emphasisAnimation &&
    !text.text3d?.enabled &&
    (!text.blendMode || text.blendMode === "normal") &&
    (text.blendOpacity === undefined || text.blendOpacity === 1)
  );
}

/**
 * The native export plan for a project, or why it has to use the web export.
 * Phase 1: the main track (videos from the gallery and photos, trimmed, at a
 * steady speed, in the default fit), music/voice tracks, and still text.
 */
export function planNativeExport(project: Project): NativeExportPlan | { reason: string } {
  const timeline = project.timeline;
  if (timeline.backgroundFillMode === "blur") return { reason: "blurred background" };
  if (timeline.backgroundFillMode === "color" && !/^#0{3}(0{3})?$/i.test(timeline.layoutBackgroundColor ?? "#000")) {
    return { reason: "coloured background" };
  }
  const extras = [
    project.shapeClips,
    project.svgClips,
    project.stickerClips,
    project.adjustmentLayers,
    project.masks,
    project.compoundClips,
    project.nestedInstances,
    project.motionInstances,
    timeline.subtitles,
  ];
  if (extras.some((list) => (list?.length ?? 0) > 0)) return { reason: "stickers, shapes or effects layers" };

  const mainTrack = findMainTrack(project);
  if (!mainTrack || mainTrack.clips.length === 0) return { reason: "empty timeline" };
  if (mainTrack.hidden) return { reason: "hidden main track" };
  if ((mainTrack.transitions?.length ?? 0) > 0) return { reason: "transitions" };
  const mediaById = new Map(project.mediaLibrary.items.map((m) => [m.id, m] as const));

  const pending: Pending[] = [];
  const main: NativeClip[] = [];
  let at = 0;
  for (const clip of [...mainTrack.clips].sort((a, b) => a.startTime - b.startTime)) {
    const media = mediaById.get(clip.mediaId);
    if (!media || media.type === "audio") return { reason: "audio on the main track" };
    if (!near(clip.startTime, at, 0.02)) return { reason: "gaps on the main track" };
    if (!plainClip(clip)) return { reason: "clip effects or position" };
    const speed = clip.speed ?? 1;
    const native: NativeClip = {
      uri: "",
      kind: media.type,
      inUs: us(clip.inPoint ?? 0),
      outUs: us((clip.inPoint ?? 0) + clip.duration * speed),
      durationUs: us(clip.duration),
      speed,
      volume: mainTrack.muted ? 0 : clip.volume ?? 1,
      sourceFrameRate: media.metadata.frameRate,
      mime: media.type === "image" ? media.blob?.type || "image/jpeg" : undefined,
    };
    const uri = galleryOriginalUri(media.id);
    if (uri) native.uri = uri;
    else if (media.type === "video") return { reason: "video not from the gallery" };
    else pending.push({ clip: native, media });
    main.push(native);
    at = clip.startTime + clip.duration;
  }
  const duration = at;
  // The editor and the web export run to the end of the last layer, so a
  // video that stopped where the main track ends would come out shorter.
  if (calculateProjectDuration(project) > duration + 0.001) return { reason: "layers past the end of the video" };

  const audio: NativeClip[][] = [];
  for (const track of timeline.tracks) {
    if (track === mainTrack || track.clips.length === 0) continue;
    const kinds = track.clips.map((c) => mediaById.get(c.mediaId)?.type);
    if (kinds.some((kind) => kind !== "audio")) return { reason: "overlays" };
    if (track.muted || track.hidden) continue;
    const lane = audioLane(track, mediaById, duration, pending);
    if ("reason" in lane) return lane;
    if (lane.clips.length > 0) audio.push(lane.clips);
  }

  const hiddenTracks = new Set(timeline.tracks.filter((t) => t.hidden).map((t) => t.id));
  const texts = (project.textClips ?? []).filter((t) => !hiddenTracks.has(t.trackId) && t.startTime < duration && t.text.trim());
  if (texts.some((t) => !plainText(t))) return { reason: "text animations" };

  return { main, audio, texts, pending, duration };
}

function audioLane(
  track: Track,
  mediaById: Map<string, MediaItem>,
  end: number,
  pending: Pending[],
): { clips: NativeClip[] } | { reason: string } {
  const clips: NativeClip[] = [];
  let at = 0;
  for (const clip of [...track.clips].sort((a, b) => a.startTime - b.startTime)) {
    if (clip.startTime >= end) break;
    if (!plainClip(clip)) return { reason: "audio effects" };
    if (clip.startTime < at - 0.001) return { reason: "overlapping audio" };
    const media = mediaById.get(clip.mediaId)!;
    const speed = clip.speed ?? 1;
    // Nothing runs past the video (see planNativeExport); this only guards rounding.
    const duration = Math.min(clip.duration, end - clip.startTime);
    const native: NativeClip = {
      uri: "",
      kind: "audio",
      inUs: us(clip.inPoint ?? 0),
      outUs: us((clip.inPoint ?? 0) + duration * speed),
      durationUs: us(duration),
      speed,
      volume: clip.volume ?? 1,
      gapBeforeUs: us(clip.startTime - at),
    };
    pending.push({ clip: native, media });
    clips.push(native);
    at = clip.startTime + duration;
  }
  return { clips };
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Hand photos and music the editor holds over to the phone as files. */
async function stageMedia(plugin: NativeExportPlugin, pending: Pending[]): Promise<void> {
  const total = pending.reduce((sum, p) => sum + (p.media.blob?.size ?? 0), 0);
  if (total > MAX_STAGED_BYTES) throw new Error("Too much media to hand over");
  const staged = new Map<string, string>();
  for (const { clip, media } of pending) {
    let uri = staged.get(media.id);
    if (!uri) {
      if (!media.blob) throw new Error(`${media.name} is not loaded`);
      const ext = media.name.split(".").pop()?.toLowerCase() || (media.type === "image" ? "jpg" : "m4a");
      uri = (await plugin.stageBegin({ ext })).uri;
      const chunk = 768 * 1024;
      for (let offset = 0; offset < media.blob.size; offset += chunk) {
        const bytes = new Uint8Array(await media.blob.slice(offset, offset + chunk).arrayBuffer());
        await plugin.stageAppend({ uri, data: toBase64(bytes) });
      }
      staged.set(media.id, uri);
    }
    clip.uri = uri;
  }
}

/**
 * Text as full-frame pictures, one per stretch of time where the same texts
 * are on screen, drawn by the same renderer as the web export.
 */
async function textPictures(
  project: Project,
  texts: TextClip[],
  width: number,
  height: number,
  duration: number,
): Promise<NativeExportRequest["overlays"]> {
  if (texts.length === 0) return [];
  const order = new Map(project.timeline.tracks.map((t, i) => [t.id, i] as const));
  const cuts = [...new Set([0, duration, ...texts.flatMap((t) => [t.startTime, t.startTime + t.duration])])]
    .filter((time) => time >= 0 && time <= duration)
    .sort((a, b) => a - b);
  const scale = { x: width / project.settings.width, y: height / project.settings.height };
  const encoder = createPngEncoder();
  const overlays: NativeExportRequest["overlays"] = [];
  // The next picture is drawn while the last one encodes; holding more full
  // frames than that would run a long caption track out of memory.
  let encoding: { start: number; end: number; png: Promise<Uint8Array> } | null = null;
  const collect = async () => {
    if (!encoding) return;
    const { start, end, png } = encoding;
    encoding = null;
    overlays.push({ startUs: us(start), endUs: us(end), png: toBase64(await png) });
  };
  try {
    for (let i = 0; i < cuts.length - 1; i++) {
      const start = cuts[i];
      const end = cuts[i + 1];
      if (end - start < 0.0005) continue;
      const mid = (start + end) / 2;
      // Front-most tracks come first, so draw from the back.
      const visible = texts
        .filter((t) => mid >= t.startTime && mid < t.startTime + t.duration)
        .sort((a, b) => (order.get(b.trackId) ?? 0) - (order.get(a.trackId) ?? 0));
      if (visible.length === 0) continue;
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not draw text");
      for (const text of visible) {
        const { canvas: layer } = titleEngine.renderText(text, width, height, mid - text.startTime, scale);
        ctx.drawImage(layer, 0, 0, width, height);
      }
      const png = encoder.encode(canvas);
      await collect();
      encoding = { start, end, png };
    }
    await collect();
    return overlays;
  } finally {
    encoder.close();
  }
}

/**
 * PNG encoding in a worker. On the main thread Chromium waits for the page to
 * go idle before encoding, which during an export took about four seconds a picture.
 */
function createPngEncoder(): { encode: (canvas: OffscreenCanvas) => Promise<Uint8Array>; close: () => void } {
  const encodeHere = async (canvas: OffscreenCanvas) => new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
  let worker: Worker;
  try {
    worker = new Worker(new URL("../workers/png-encoder-worker.ts", import.meta.url), { type: "module" });
  } catch {
    return { encode: encodeHere, close: () => undefined };
  }
  const waiting = new Map<number, { resolve: (png: Uint8Array) => void; reject: (error: Error) => void }>();
  let nextId = 0;
  worker.onmessage = (event: MessageEvent<{ id: number; buffer?: ArrayBuffer; error?: string }>) => {
    const { id, buffer, error } = event.data;
    const pending = waiting.get(id);
    waiting.delete(id);
    if (buffer) pending?.resolve(new Uint8Array(buffer));
    else pending?.reject(new Error(error ?? "Could not encode text"));
  };
  worker.onerror = () => {
    for (const pending of waiting.values()) pending.reject(new Error("The text encoder stopped"));
    waiting.clear();
  };
  return {
    encode: (canvas) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        waiting.set(id, { resolve, reject });
        const bitmap = canvas.transferToImageBitmap();
        worker.postMessage({ id, bitmap }, [bitmap]);
      }),
    close: () => worker.terminate(),
  };
}

/** Everything the phone needs for this export, or null when it can't do it natively. */
export async function prepareNativeExport(
  project: Project,
  settings: Pick<VideoExportSettings, "width" | "height" | "frameRate" | "bitrate">,
  filename: string,
): Promise<NativeExportRequest | null> {
  const plugin = getNativeExporter();
  if (!plugin || typeof OffscreenCanvas === "undefined") return null;
  const plan = planNativeExport(project);
  if ("reason" in plan) {
    console.info(`[native-export] Using the web export: ${plan.reason}`);
    return null;
  }
  try {
    await stageMedia(plugin, plan.pending);
    if (plan.texts.length > 0) await ensureProjectFonts(project);
    const overlays = await textPictures(project, plan.texts, settings.width, settings.height, plan.duration);
    return {
      width: settings.width,
      height: settings.height,
      frameRate: settings.frameRate,
      bitrate: Math.round(settings.bitrate * 1000),
      main: plan.main,
      audio: plan.audio,
      overlays,
      filename,
    };
  } catch (error) {
    console.warn("[native-export] Could not prepare; using the web export:", error);
    return null;
  }
}
