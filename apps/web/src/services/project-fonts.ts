import type { Project, MotionComposition } from "@openreel/core";
import { BUNDLED_FONTS, GOOGLE_FONT_SPECS } from "./font-catalog";
import { initCustomFonts } from "../components/editor/inspector/font-options";

const initialFamilies = new Set(["Geist", "Geist Mono", "Inter"]);
const pendingStylesheets = new Map<string, Promise<void>>();
const pendingBundled = new Map<string, Promise<void>>();
export interface ProjectFont { family: string; weight: string; sample: string }

function loadStylesheet(family: string): Promise<void> {
  const spec = GOOGLE_FONT_SPECS[family];
  if (!spec || initialFamilies.has(family) || window.openreel?.platform === "desktop") return Promise.resolve();
  const pending = pendingStylesheets.get(family);
  if (pending) return pending;
  const promise = new Promise<void>((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.dataset.openreelFont = family;
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(spec).replace(/%20/g, "+")}&display=swap`;
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      link.onload = null; link.onerror = null;
      if (error) { link.remove(); pendingStylesheets.delete(family); reject(error); }
      else resolve();
    };
    const timeout = setTimeout(() => finish(new Error(`Could not load ${family}. Check your connection or choose a system font.`)), 10_000);
    link.onload = () => finish();
    link.onerror = () => finish(new Error(`Could not load ${family}. Check your connection or choose a system font.`));
    document.head.appendChild(link);
  });
  pendingStylesheets.set(family, promise);
  return promise;
}

/** Add a font shipped with the app to the page, once. */
function loadBundled(family: string): Promise<void> {
  const file = BUNDLED_FONTS[family];
  if (!file || typeof FontFace === "undefined") return Promise.resolve();
  const pending = pendingBundled.get(family);
  if (pending) return pending;
  const promise = new FontFace(family, `url("${import.meta.env.BASE_URL}fonts/bundled/${file}")`)
    .load()
    .then((face) => {
      document.fonts.add(face);
    })
    .catch((error: unknown) => {
      pendingBundled.delete(family);
      throw error;
    });
  pendingBundled.set(family, promise);
  return promise;
}

export async function ensureFontFamily(family: string, weight: string | number = 400, sample = "OpenReel"): Promise<void> {
  if (typeof document === "undefined" || !document.fonts || !family) return;
  // Not a catalogue font: it may be one the user uploaded. A stuck font
  // database must never hold up the preview or an export.
  if (BUNDLED_FONTS[family]) await loadBundled(family);
  else if (!GOOGLE_FONT_SPECS[family] && !initialFamilies.has(family)) {
    await Promise.race([initCustomFonts().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 3000))]);
  }
  await loadStylesheet(family);
  const fontWeight = typeof weight === "number" || /^\d+$/.test(weight) ? String(weight) : weight === "bold" ? "700" : "400";
  await document.fonts.load(`${fontWeight} 48px ${JSON.stringify(family)}`, sample || "OpenReel");
}

export function collectProjectFonts(project: Pick<Project, "textClips" | "timeline" | "motionCompositions">): ProjectFont[] {
  const fonts = new Map<string, { family: string; weight: string; characters: Set<string> }>();
  const add = (family: string | undefined, weight: string | number | undefined, text: string) => {
    if (!family) return;
    const normalizedWeight = String(weight ?? 400);
    const key = `${family}:${normalizedWeight}`;
    const entry = fonts.get(key) ?? { family, weight: normalizedWeight, characters: new Set<string>() };
    for (const character of text) entry.characters.add(character);
    fonts.set(key, entry);
  };
  for (const clip of project.textClips ?? []) add(clip.style.fontFamily, clip.style.fontWeight, clip.text);
  for (const subtitle of project.timeline.subtitles ?? []) add(subtitle.style?.fontFamily, 700, subtitle.text);
  for (const composition of project.motionCompositions ?? []) {
    for (const layer of composition.layers) if (layer.type === "text") add(layer.style.fontFamily, layer.style.fontWeight, layer.text);
  }
  return [...fonts.values()].map(({ family, weight, characters }) => ({ family, weight, sample: [...characters].join("") }));
}

export async function ensureProjectFonts(project: Pick<Project, "textClips" | "timeline" | "motionCompositions">): Promise<void> {
  await Promise.all(collectProjectFonts(project).map((font) => ensureFontFamily(font.family, font.weight, font.sample)));
}

export function motionFontProject(composition: MotionComposition): Pick<Project, "textClips" | "timeline" | "motionCompositions"> {
  return { textClips: [], timeline: { tracks: [], subtitles: [], markers: [], duration: composition.duration }, motionCompositions: [composition] };
}
