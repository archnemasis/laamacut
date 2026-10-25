import type { MediaItem, Project, Track } from "@openreel/core";
import { useProjectStore } from "../stores/project-store";

let pickerRequested = false;

/** Ask the phone editor to open the media picker as soon as it mounts (new projects). */
export function requestPhoneMediaPicker(): void {
  pickerRequested = true;
}

/** True once per request; the phone editor calls this on mount. */
export function takePhoneMediaPickerRequest(): boolean {
  const requested = pickerRequested;
  pickerRequested = false;
  return requested;
}

const isPicture = (project: Project, mediaId: string): boolean =>
  project.mediaLibrary.items.find((m) => m.id === mediaId)?.type !== "audio";

/** The track CapCut would call the main track: the first one holding pictures. */
export function findMainTrack(project: Project): Track | undefined {
  return (
    project.timeline.tracks.find((t) => t.clips.some((c) => isPicture(project, c.mediaId))) ??
    project.timeline.tracks.find((t) => t.type === "video")
  );
}

const trackEnd = (track: Track): number =>
  track.clips.reduce((end, clip) => Math.max(end, clip.startTime + clip.duration), 0);

/** Canvas size matching a clip's shape, with a 1080 short side (CapCut's "Original"). */
export function canvasForMedia(media: Pick<MediaItem, "metadata">): { width: number; height: number } | null {
  const { width, height } = media.metadata;
  if (!width || !height) return null;
  const scale = 1080 / Math.min(width, height);
  const even = (n: number) => Math.round((n * scale) / 2) * 2;
  return { width: even(width), height: even(height) };
}

/**
 * Lay a track's clips end to end in `orderedIds` order, starting where the
 * first clip starts now, as one undo step. Clips are parked past the end
 * first so no move lands on top of another clip.
 */
export async function reorderTrackClips(trackId: string, orderedIds: readonly string[]): Promise<void> {
  const store = useProjectStore.getState();
  const track = store.project.timeline.tracks.find((t) => t.id === trackId);
  if (!track) return;
  const byId = new Map(track.clips.map((c) => [c.id, c] as const));
  const clips = orderedIds.map((id) => byId.get(id)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  if (clips.length < 2) return;
  const start = Math.min(...clips.map((c) => c.startTime));
  let park = trackEnd(track) + 10;
  const parked = clips.map((clip) => {
    const move = { clipId: clip.id, startTime: park, trackId };
    park += clip.duration + 1;
    return move;
  });
  let at = start;
  const placed = clips.map((clip) => {
    const move = { clipId: clip.id, startTime: at, trackId };
    at += clip.duration;
    return move;
  });
  await store.moveClips([...parked, ...placed]);
}

/**
 * Import files in the order they were picked and lay them end to end on the
 * main track. On an empty project the canvas takes the first picture's shape.
 * Returns how many files were added.
 */
export async function addMediaFilesToTimeline(
  files: readonly File[],
  onImported?: (index: number, mediaId: string) => void | Promise<void>,
): Promise<number> {
  const store = useProjectStore.getState;
  const startedEmpty = !findMainTrack(store().project)?.clips.length;
  let added = 0;

  for (const [index, file] of files.entries()) {
    const imported = await store().importMedia(file);
    const mediaId = imported.success ? imported.actionId : undefined;
    if (!mediaId) continue;
    await onImported?.(index, mediaId);

    if (startedEmpty && added === 0) {
      const media = store().project.mediaLibrary.items.find((m) => m.id === mediaId);
      const canvas = media && media.type !== "audio" ? canvasForMedia(media) : null;
      if (canvas) await store().updateSettings(canvas);
    }

    const track = findMainTrack(store().project);
    const result = track
      ? await store().addClip(track.id, mediaId, trackEnd(track))
      : await store().addClipToNewTrack(mediaId, 0);
    if (result.success) added++;
  }
  return added;
}
