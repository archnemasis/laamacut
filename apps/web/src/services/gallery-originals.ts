import type { Project } from "@openreel/core";
import type { GalleryItem } from "./phone-gallery";

const ORIGINALS_KEY = "laamacut-gallery-originals";
export type GalleryOriginal = Pick<GalleryItem, "uri" | "name" | "mime"> & {
  /** False when the clip already holds the full file (HD, photos): web export has nothing to swap. */
  copy?: boolean;
};

function loadOriginals(): Record<string, GalleryOriginal> {
  try {
    return JSON.parse(localStorage.getItem(ORIGINALS_KEY) ?? "{}") as Record<string, GalleryOriginal>;
  } catch {
    return {};
  }
}

/**
 * Remember which gallery file a clip came from: export goes back to the
 * full-quality original of a small editing copy, and the phone's native
 * export reads gallery files directly.
 */
export function rememberGalleryOriginal(mediaId: string, item: GalleryItem, copy = true): void {
  try {
    const originals = loadOriginals();
    originals[mediaId] = { uri: item.uri, name: item.name, mime: item.mime, copy };
    localStorage.setItem(ORIGINALS_KEY, JSON.stringify(originals));
  } catch {
    // Storage full or blocked: export falls back to the editing copy.
  }
}

/** Where a clip's gallery file is, and whether the clip holds an editing copy of it. */
export function galleryOriginal(mediaId: string): GalleryOriginal | undefined {
  return loadOriginals()[mediaId];
}

/** The phone gallery file a clip came from, if it was picked from the gallery. */
export function galleryOriginalUri(mediaId: string): string | undefined {
  return loadOriginals()[mediaId]?.uri;
}

/** Originals being read, so export can start reading them early (see prefetchGalleryOriginals). */
const reading = new Map<string, Promise<File | undefined>>();

function readOriginal(original: GalleryOriginal, convert: (path: string) => string): Promise<File | undefined> {
  let file = reading.get(original.uri);
  if (!file) {
    file = fetch(convert(original.uri))
      .then(async (response) => {
        if (!response.ok) return undefined;
        const blob = await response.blob();
        return new File([blob], original.name, { type: original.mime || blob.type });
      })
      .catch(() => undefined)
      .finally(() => setTimeout(() => reading.delete(original.uri), 60_000));
    reading.set(original.uri, file);
  }
  return file;
}

/** Start reading the project's gallery originals now, ahead of an export. */
export function prefetchGalleryOriginals(project: Project): void {
  const convert = typeof window !== "undefined" ? window.Capacitor?.convertFileSrc : undefined;
  if (!convert) return;
  const originals = loadOriginals();
  for (const item of project.mediaLibrary.items) {
    const original = originals[item.id];
    if (original && original.copy !== false) void readOriginal(original, convert);
  }
}

/**
 * The project as export should see it: clips edited with a small copy get
 * their full-quality gallery original back. The editor's project is not
 * touched. A missing original (deleted from the phone) keeps the copy.
 */
export async function withGalleryOriginals(project: Project): Promise<Project> {
  const convert = typeof window !== "undefined" ? window.Capacitor?.convertFileSrc : undefined;
  const originals = loadOriginals();
  if (!convert || !project.mediaLibrary.items.some((item) => originals[item.id]?.copy !== false && originals[item.id])) return project;
  const items = await Promise.all(
    project.mediaLibrary.items.map(async (item) => {
      const original = originals[item.id];
      if (!original || original.copy === false) return item;
      const file = await readOriginal(original, convert);
      return file ? { ...item, blob: file } : item;
    }),
  );
  return { ...project, mediaLibrary: { ...project.mediaLibrary, items } };
}
