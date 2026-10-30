import { useProjectStore } from "../stores/project-store";
import { previewProxyCache } from "../stores/preview-proxy-store";
import { loadFilmstrip } from "./filmstrip-cache";
import { GalleryFile } from "./gallery-file";

/** The Android app's LaamacutGallery plugin (GalleryPlugin.java). */
export type GalleryAccess = "granted" | "limited" | "denied";
export type GalleryKind = "video" | "photo" | "audio";

export interface GalleryItem {
  uri: string;
  name: string;
  mime: string;
  size: number;
  /** Seconds, videos only. */
  duration?: number;
}

export interface GalleryVideoProbe {
  width: number;
  height: number;
  /** 0 when the file doesn't say. */
  fps: number;
  /** Seconds. */
  duration?: number;
  videoCodec?: string;
  audioTracks?: number;
  sampleRate?: number;
  channels?: number;
}

export interface GalleryPlugin {
  access(): Promise<{ access: GalleryAccess }>;
  requestAccess(): Promise<{ access: GalleryAccess }>;
  /** With limited access, Android's "select more" prompt. */
  requestMore(): Promise<{ access: GalleryAccess }>;
  /** Music and sounds (a separate permission from photos and videos). */
  audioAccess(): Promise<{ access: "granted" | "denied" }>;
  requestAudioAccess(): Promise<{ access: "granted" | "denied" }>;
  list(options: { kind: GalleryKind; offset: number; limit: number }): Promise<{ items: GalleryItem[] }>;
  thumbnail(options: { uri: string; size: number }): Promise<{ data: string }>;
  /** Size as shown (rotation applied) and frame rate, read without decoding the video. */
  probe(options: { uri: string }): Promise<GalleryVideoProbe>;
  /** Hardware-encode a smaller H.264 copy (short side `height`, at most 30fps), kept on the phone; resolves to its file:// path, or none when the video is already small. */
  compress(options: { uri: string; height: number }): Promise<{ path?: string }>;
  discard(options: { path: string }): Promise<void>;
  /** The video's audio track copied out as an .m4a (cached); no path when it has no sound. */
  extractAudio(options: { uri: string }): Promise<{ path?: string }>;
  /** Filmstrip frames decoded by the phone, as JPEG data URLs. */
  frames(options: { uri: string; count: number; height: number }): Promise<{ frames: { timestamp: number; data: string }[] }>;
}

export function getGallery(): GalleryPlugin | undefined {
  return typeof window !== "undefined" ? window.Capacitor?.Plugins?.LaamacutGallery : undefined;
}

const HD_KEY = "laamacut-phone-hd";

/** HD off (the default) edits heavy videos from small preview copies; exports always use the original. */
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
  /** Small copy for smooth editing playback (HD off). */
  previewCopy?: Blob;
}

/** What the phone makes for a gallery video, decided from a quick look at the file. */
export interface GalleryVideoPlan {
  filmstrip: Promise<GalleryVideoExtras["filmstrip"]>;
  /** A small copy being made, for videos too heavy to edit smoothly as they are. */
  previewCopy?: Promise<Blob | undefined>;
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
/** Short side of a preview copy: sharp in the phone preview, still light to decode. */
const PREVIEW_SHORT_SIDE = 720;
/** Phones play up to 1080p at 60fps smoothly, so those videos need no copy. */
const SMOOTH_SHORT_SIDE = 1080;
const SMOOTH_FPS = 61;

/** True when a video is too big or too fast to play smoothly in the editor (unknown counts as heavy). */
export function isHeavyVideo(probe: GalleryVideoProbe | undefined): boolean {
  if (!probe) return true;
  return Math.min(probe.width, probe.height) > SMOOTH_SHORT_SIDE || probe.fps > SMOOTH_FPS;
}

function makePreviewCopy(gallery: GalleryPlugin, uri: string, convert: (path: string) => string): Promise<Blob | undefined> {
  return queueCopy(() => gallery.compress({ uri, height: PREVIEW_SHORT_SIDE }))
    .then(async ({ path }) => {
      if (!path) return undefined;
      // The copy stays on the phone, so a reopened project gets it back at once.
      const blob = await (await fetch(convert(path))).blob();
      return new Blob([blob], { type: "video/mp4" });
    })
    .catch((error: unknown) => {
      console.warn("[phone-gallery] Preview copy failed; using the original:", error);
      return undefined;
    });
}

/**
 * Like CapCut, only heavy videos (over 1080p or 60fps) get a preview copy,
 * made in the background while editing starts on the original, which is
 * read straight from storage (GalleryFile). The phone decodes filmstrip
 * frames either way; any step may fail on unusual files and the clip still
 * imports.
 */
export async function prepareGalleryVideo(item: GalleryItem, hd: boolean): Promise<GalleryVideoPlan> {
  const gallery = getGallery();
  const convert = window.Capacitor?.convertFileSrc;
  if (!gallery || !convert) return { filmstrip: Promise.resolve([]) };
  const filmstrip = loadFilmstrip(item.uri, () =>
    gallery.frames({ uri: item.uri, count: 10, height: 160 }).then(({ frames }) => frames.map((frame) => ({ timestamp: frame.timestamp, url: frame.data }))),
  );
  if (hd) return { filmstrip };
  const probe = await gallery.probe({ uri: item.uri }).catch(() => undefined);
  if (!isHeavyVideo(probe)) return { filmstrip };
  return { filmstrip, previewCopy: makePreviewCopy(gallery, item.uri, convert) };
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

/**
 * Give a reopened project's heavy gallery videos their preview copies back.
 * The copies are kept on the phone, so this is quick; without them the
 * editor would decode the full-size original, which is choppy and can run
 * the phone out of video decoders.
 */
const restoringCopies = new Set<string>();
export function restoreGalleryPreviewCopies(items: { id: string; type: string; blob?: Blob | null }[]): void {
  const gallery = getGallery();
  const convert = window.Capacitor?.convertFileSrc;
  if (!gallery || !convert || loadHdPreference()) return;
  for (const item of items) {
    if (item.type !== "video" || !(item.blob instanceof GalleryFile)) continue;
    if (previewProxyCache.store.getState().entries[item.id] || restoringCopies.has(item.id)) continue;
    restoringCopies.add(item.id);
    const { uri } = item.blob.source;
    void gallery
      .probe({ uri })
      .catch(() => undefined)
      .then((probe) => (isHeavyVideo(probe) ? makePreviewCopy(gallery, uri, convert) : undefined))
      .then((previewCopy) => {
        if (previewCopy) applyGalleryVideoExtras(item.id, { filmstrip: [], previewCopy });
      })
      .finally(() => restoringCopies.delete(item.id));
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
