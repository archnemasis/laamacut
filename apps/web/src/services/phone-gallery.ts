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
}

export function getGallery(): GalleryPlugin | undefined {
  return typeof window !== "undefined" ? window.Capacitor?.Plugins?.LaamacutGallery : undefined;
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
