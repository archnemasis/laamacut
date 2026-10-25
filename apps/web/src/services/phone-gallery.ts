import { useProjectStore } from "../stores/project-store";
import { previewProxyCache } from "../stores/preview-proxy-store";

/** The Android app's LaamacutGallery plugin (GalleryPlugin.java). */
export type GalleryAccess = "granted" | "limited" | "denied";
export type GalleryKind = "video" | "photo";

export interface GalleryItem {
  uri: string;
  name: string;
  mime: string;
  size: number;
  /** Seconds, videos only. */
  duration?: number;
}

export interface GalleryPlugin {
  access(): Promise<{ access: GalleryAccess }>;
  requestAccess(): Promise<{ access: GalleryAccess }>;
  list(options: { kind: GalleryKind; offset: number; limit: number }): Promise<{ items: GalleryItem[] }>;
  thumbnail(options: { uri: string; size: number }): Promise<{ data: string }>;
  /** Hardware-encode a smaller H.264 copy; resolves to its file:// path, or none when the video is already small. */
  compress(options: { uri: string; height: number }): Promise<{ path?: string }>;
  discard(options: { path: string }): Promise<void>;
  /** Filmstrip frames decoded by the phone, as JPEG data URLs. */
  frames(options: { uri: string; count: number; height: number }): Promise<{ frames: { timestamp: number; data: string }[] }>;
}

export function getGallery(): GalleryPlugin | undefined {
  return typeof window !== "undefined" ? window.Capacitor?.Plugins?.LaamacutGallery : undefined;
}

const HD_KEY = "laamacut-phone-hd";

/** HD off (the default) edits with 540p preview copies; exports always use the original. */
export function loadHdPreference(): boolean {
  try {
    return localStorage.getItem(HD_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveHdPreference(hd: boolean): void {
  try {
    localStorage.setItem(HD_KEY, hd ? "1" : "0");
  } catch {
    // Private mode: the toggle just resets next time.
  }
}

/** What the phone prepares for a gallery video before it goes on the timeline. */
export interface GalleryVideoExtras {
  filmstrip: { timestamp: number; url: string }[];
  /** 540p copy for smooth editing playback (HD off). */
  previewCopy?: Blob;
}

/**
 * Preview copies are made one at a time: phones have only a couple of hardware
 * encoders, and copies started together fall back to the much slower software one.
 */
let copyQueue: Promise<unknown> = Promise.resolve();
function queueCopy<T>(start: () => Promise<T>): Promise<T> {
  const next = copyQueue.catch(() => undefined).then(start);
  copyQueue = next;
  return next;
}
const PREVIEW_HEIGHT = 540;

/**
 * Have the phone decode filmstrip frames and, with HD off, encode a 540p
 * preview copy. Either may fail on unusual files; the clip still imports.
 */

export async function prepareGalleryVideo(uri: string, hd: boolean): Promise<GalleryVideoExtras> {
  const gallery = getGallery();
  const convert = window.Capacitor?.convertFileSrc;
  if (!gallery || !convert) return { filmstrip: [] };
  const filmstrip = gallery
    .frames({ uri, count: 10, height: 160 })
    .then(({ frames }) => frames.map((frame) => ({ timestamp: frame.timestamp, url: frame.data })))
    .catch(() => []);
  const previewCopy = hd
    ? Promise.resolve(undefined)
    : queueCopy(() => gallery.compress({ uri, height: PREVIEW_HEIGHT }))
        .then(async ({ path }) => {
          if (!path) return undefined;
          try {
            const blob = await (await fetch(convert(path))).blob();
            return new Blob([blob], { type: "video/mp4" });
          } finally {
            await gallery.discard({ path }).catch(() => undefined);
          }
        })
        .catch((error: unknown) => {
          console.warn("[phone-gallery] Preview copy failed; using the original:", error);
          return undefined;
        });
  return { filmstrip: await filmstrip, previewCopy: await previewCopy };
}

/** Put the prepared filmstrip and preview copy on an imported clip. */
export function applyGalleryVideoExtras(mediaId: string, extras: GalleryVideoExtras): void {
  const { project } = useProjectStore.getState();
  const item = project.mediaLibrary.items.find((m) => m.id === mediaId);
  if (!item) return;
  if (extras.filmstrip.length > 0) {
    const updated = { ...item, thumbnailUrl: extras.filmstrip[0].url, filmstripThumbnails: extras.filmstrip };
    useProjectStore.setState({
      project: {
        ...project,
        mediaLibrary: {
          ...project.mediaLibrary,
          items: project.mediaLibrary.items.map((m) => (m.id === mediaId ? updated : m)),
        },
      },
    });
  }
  if (extras.previewCopy) {
    const current = useProjectStore.getState().project.mediaLibrary.items.find((m) => m.id === mediaId);
    if (current) previewProxyCache.adopt(current, extras.previewCopy, "medium");
  }
}

/** Load a gallery item as a File through Capacitor's content:// bridge (no base64 copy). */
export async function galleryItemToFile(item: GalleryItem): Promise<File> {
  const convert = window.Capacitor?.convertFileSrc;
  if (!convert) throw new Error("Gallery files are only available in the Android app");
  const response = await fetch(convert(item.uri));
  if (!response.ok) throw new Error(`Could not open ${item.name}`);
  const blob = await response.blob();
  return new File([blob], item.name, { type: item.mime || blob.type });
}

export { rememberGalleryOriginal } from "./gallery-originals";
