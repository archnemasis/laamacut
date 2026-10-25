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
 * Remember which gallery file a clip's small editing copy came from, so export
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
    if (original) void readOriginal(original, convert);
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
  if (!convert || !project.mediaLibrary.items.some((item) => originals[item.id])) return project;
  const items = await Promise.all(
    project.mediaLibrary.items.map(async (item) => {
      const original = originals[item.id];
      if (!original) return item;
      const file = await readOriginal(original, convert);
      return file ? { ...item, blob: file } : item;
    }),
  );
  return { ...project, mediaLibrary: { ...project.mediaLibrary, items } };
}
