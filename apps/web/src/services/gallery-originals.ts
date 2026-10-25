import type { Project } from "@openreel/core";
import type { GalleryItem } from "./phone-gallery";

const ORIGINALS_KEY = "laamacut-gallery-originals";
type GalleryOriginal = Pick<GalleryItem, "uri" | "name" | "mime">;

function loadOriginals(): Record<string, GalleryOriginal> {
  try {
    return JSON.parse(localStorage.getItem(ORIGINALS_KEY) ?? "{}") as Record<string, GalleryOriginal>;
  } catch {
    return {};
  }
}

/**
 * Remember which gallery file a clip's 720p editing copy came from, so export
 * can go back to the full-quality original.
 */
export function rememberGalleryOriginal(mediaId: string, item: GalleryItem): void {
  try {
    const originals = loadOriginals();
    originals[mediaId] = { uri: item.uri, name: item.name, mime: item.mime };
    localStorage.setItem(ORIGINALS_KEY, JSON.stringify(originals));
  } catch {
    // Storage full or blocked: export falls back to the editing copy.
  }
}

/**
 * The project as export should see it: clips edited with a 720p copy get
 * their full-quality gallery original back. The editor's project is not
 * touched. A missing original (deleted from the phone) keeps the copy.
 */
export async function withGalleryOriginals(project: Project): Promise<Project> {
  const convert = typeof window !== "undefined" ? window.Capacitor?.convertFileSrc : undefined;
  const originals = loadOriginals();
  if (!convert || !project.mediaLibrary.items.some((item) => originals[item.id])) return project;
  const items = await Promise.all(
    project.mediaLibrary.items.map(async (item) => {
      const original = originals[item.id];
      if (!original) return item;
      try {
        const response = await fetch(convert(original.uri));
        if (!response.ok) return item;
        const blob = await response.blob();
        return { ...item, blob: new File([blob], original.name, { type: original.mime || blob.type }) };
      } catch {
        return item;
      }
    }),
  );
  return { ...project, mediaLibrary: { ...project.mediaLibrary, items } };
}
