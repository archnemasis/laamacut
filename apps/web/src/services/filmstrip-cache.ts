import { createStore, del, get, set, type UseStore } from "idb-keyval";

export type FilmstripFrame = { timestamp: number; url: string };

/** About 100KB each; older ones are dropped past this. */
const MAX_SAVED = 200;
const ORDER_KEY = "laamacut-filmstrip-order";

let store: UseStore | null | undefined;
function filmstripStore(): UseStore | null {
  if (store === undefined) store = typeof indexedDB === "undefined" ? null : createStore("laamacut-filmstrips", "frames");
  return store;
}

function loadOrder(): string[] {
  try {
    return JSON.parse(localStorage.getItem(ORDER_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

/** Mark a filmstrip as just used and forget the oldest ones over the limit. */
function touch(key: string, db: UseStore): void {
  const order = [...loadOrder().filter((k) => k !== key), key];
  for (const old of order.splice(0, Math.max(0, order.length - MAX_SAVED))) void del(old, db).catch(() => undefined);
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(order));
  } catch {
    // Storage full: the list just stops trimming.
  }
}

/**
 * A video's timeline filmstrip, saved on the phone after the first time it's
 * made, so reopening a project or adding the same video again shows pictures
 * straight away instead of decoding the video again. `key` is the gallery
 * file's uri (or another id that stays the same for the same video).
 */
export async function loadFilmstrip(key: string, make: () => Promise<FilmstripFrame[]>): Promise<FilmstripFrame[]> {
  const db = filmstripStore();
  if (db) {
    // A stuck database must never hold up an import, so give up after a moment.
    const saved = await Promise.race([
      get<FilmstripFrame[]>(key, db).catch(() => undefined),
      new Promise<undefined>((resolve) => setTimeout(resolve, 1500)),
    ]);
    if (saved && saved.length > 0) {
      touch(key, db);
      return saved;
    }
  }
  const frames = await make().catch(() => []);
  if (db && frames.length > 0) {
    void set(key, frames, db).then(() => touch(key, db), () => undefined);
  }
  return frames;
}
