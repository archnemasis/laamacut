/**
 * Fonts the user uploads, kept in IndexedDB on this device and registered with
 * document.fonts so text clips, the preview and exports can all draw them.
 */

export interface UserFont {
  family: string;
  /** The uploaded file's name. */
  fileName: string;
  data: ArrayBuffer;
  addedAt: number;
}

const DB_NAME = "laamacut-user-fonts";
const STORE = "fonts";
export const USER_FONT_ACCEPT = ".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2";

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "family" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve, reject) => {
    const request = run(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const registered = new Set<string>();

function register(font: UserFont): Promise<void> {
  if (registered.has(font.family) || typeof FontFace === "undefined") return Promise.resolve();
  const face = new FontFace(font.family, font.data);
  return face.load().then((loaded) => {
    document.fonts.add(loaded);
    registered.add(font.family);
  });
}

export async function listUserFonts(): Promise<UserFont[]> {
  const fonts = (await withStore<UserFont[]>("readonly", (store) => store.getAll())) ?? [];
  return fonts.sort((a, b) => b.addedAt - a.addedAt);
}

let ready: Promise<string[]> | null = null;

/** Registers every uploaded font once; resolves with their family names. */
export function loadUserFonts(): Promise<string[]> {
  if (ready) return ready;
  const load = listUserFonts().then(async (fonts) => {
    await Promise.all(fonts.map((font) => register(font).catch(() => undefined)));
    return fonts.map((font) => font.family);
  });
  // A stuck database must never hold up the preview or an export.
  const timeout = new Promise<string[]>((resolve) => setTimeout(() => resolve([]), 3000));
  ready = Promise.race([load, timeout]).catch(() => []);
  return ready;
}

/** "my_cool-font.ttf" → "my cool font". */
function familyFromFile(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return base || "My font";
}

/** Saves an uploaded font file and makes it usable right away. */
export async function addUserFont(file: File): Promise<string> {
  const data = await file.arrayBuffer();
  const existing = new Set((await listUserFonts()).map((font) => font.family));
  const base = familyFromFile(file.name);
  let family = base;
  for (let n = 2; existing.has(family); n++) family = `${base} ${n}`;
  const font: UserFont = { family, fileName: file.name, data, addedAt: Date.now() };
  // Load it first, so a file that isn't a font is turned away before it's saved.
  try {
    await register(font);
  } catch {
    throw new Error(`${file.name} isn't a font Laamacut can use. Try a .ttf, .otf or .woff file.`);
  }
  await withStore("readwrite", (store) => store.put(font));
  ready = null;
  return family;
}
