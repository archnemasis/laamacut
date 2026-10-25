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
  /** Hardware-encode a smaller H.264 copy; resolves to its file:// path. */
  compress(options: { uri: string; height: number }): Promise<{ path: string }>;
  discard(options: { path: string }): Promise<void>;
}

export function getGallery(): GalleryPlugin | undefined {
  return typeof window !== "undefined" ? window.Capacitor?.Plugins?.LaamacutGallery : undefined;
}

const HD_KEY = "laamacut-phone-hd";

/** HD off (the default) edits with 720p preview copies; exports always use the original. */
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

/**
 * Make a 720p preview copy of a gallery video and use it for editing playback
 * of the imported clip. Runs in the background; the original plays until then.
 */
export async function attachPreviewCopy(uri: string, mediaId: string): Promise<void> {
  const gallery = getGallery();
  const convert = window.Capacitor?.convertFileSrc;
  if (!gallery || !convert) return;
  const { path } = await gallery.compress({ uri, height: 720 });
  try {
    const blob = await (await fetch(convert(path))).blob();
    const item = useProjectStore.getState().project.mediaLibrary.items.find((m) => m.id === mediaId);
    if (item) previewProxyCache.adopt(item, new Blob([blob], { type: "video/mp4" }), "medium");
  } finally {
    await gallery.discard({ path }).catch(() => undefined);
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
