import type { MediaItem } from "@openreel/core";
import { useProjectStore } from "../stores/project-store";
import { galleryOriginalUri } from "./gallery-originals";
import { getGallery } from "./phone-gallery";
import { loadFilmstrip } from "./filmstrip-cache";

const FRAMES = 10;
const HEIGHT = 160;
const making = new Set<string>();

type Frame = { timestamp: number; url: string };

/** Frames from the phone's own decoder: fast, and works for any gallery video. */
async function phoneFrames(mediaId: string): Promise<Frame[]> {
  const gallery = getGallery();
  const uri = galleryOriginalUri(mediaId);
  if (!gallery || !uri) return [];
  const { frames } = await gallery.frames({ uri, count: FRAMES, height: HEIGHT });
  return frames.map((frame) => ({ timestamp: frame.timestamp, url: frame.data }));
}

/** Frames by seeking a hidden video element through the clip. */
async function videoFrames(blob: Blob): Promise<Frame[]> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("Video could not be read"));
      setTimeout(() => reject(new Error("Video load timeout")), 10_000);
    });
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0 || !video.videoHeight) return [];
    const canvas = document.createElement("canvas");
    canvas.height = HEIGHT;
    canvas.width = Math.max(1, Math.round((video.videoWidth / video.videoHeight) * HEIGHT));
    const ctx = canvas.getContext("2d");
    if (!ctx) return [];
    const frames: Frame[] = [];
    for (let i = 0; i < FRAMES; i++) {
      const timestamp = ((i + 0.5) / FRAMES) * duration;
      await new Promise<void>((resolve) => {
        const done = () => {
          video.removeEventListener("seeked", done);
          resolve();
        };
        video.addEventListener("seeked", done);
        setTimeout(done, 1500);
        video.currentTime = timestamp;
      });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push({ timestamp, url: canvas.toDataURL("image/jpeg", 0.7) });
    }
    return frames;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

/**
 * Give a video its timeline filmstrip when it has none (saved projects keep
 * only one picture, and that can fail on phones, leaving the clip black).
 * The phone's decoder is tried first, then the browser's.
 */
export function ensureFilmstrip(media: MediaItem): void {
  if (media.type !== "video" || (media.filmstripThumbnails?.length ?? 0) > 1 || making.has(media.id)) return;
  const blob = media.blob;
  making.add(media.id);
  void (async () => {
    const frames = await loadFilmstrip(galleryOriginalUri(media.id) ?? `media:${media.id}`, async () => {
      const fromPhone = await phoneFrames(media.id).catch(() => []);
      return fromPhone.length > 0 || !blob ? fromPhone : videoFrames(blob);
    });
    if (frames.length === 0) return;
    const { project } = useProjectStore.getState();
    const current = project.mediaLibrary.items.find((m) => m.id === media.id);
    if (!current || (current.filmstripThumbnails?.length ?? 0) > 1) return;
    useProjectStore.setState({
      project: {
        ...project,
        mediaLibrary: {
          ...project.mediaLibrary,
          items: project.mediaLibrary.items.map((m) =>
            m.id === media.id ? { ...m, thumbnailUrl: m.thumbnailUrl ?? frames[0].url, filmstripThumbnails: frames } : m,
          ),
        },
      },
    });
  })().finally(() => making.delete(media.id));
}
