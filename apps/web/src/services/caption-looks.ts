import type { TextAnimationPreset, TextStyle } from "@openreel/core";

/** A ready-made caption style: colours, outline, shadow and how each caption comes in. */
export interface CaptionLook {
  readonly id: string;
  readonly label: string;
  readonly style: Partial<TextStyle>;
  readonly animation: TextAnimationPreset;
  /** Write the captions in capitals, like CapCut's bold templates. */
  readonly uppercase?: boolean;
}

const outline = (strokeColor: string, strokeWidth = 6): Partial<TextStyle> => ({ strokeColor, strokeWidth });
const shadow = (shadowColor: string, shadowBlur = 12, shadowOffsetY = 4): Partial<TextStyle> => ({
  shadowColor,
  shadowBlur,
  shadowOffsetX: 0,
  shadowOffsetY,
});
/** A solid shadow dropped below and to the right, CapCut's chunky "sticker" look. */
const hardShadow = (shadowColor = "#000000", offset = 7): Partial<TextStyle> => ({
  shadowColor,
  shadowBlur: 0,
  shadowOffsetX: offset * 0.6,
  shadowOffsetY: offset,
});
/** A soft halo of colour around the letters. */
const glow = (shadowColor: string, shadowBlur = 26): Partial<TextStyle> => ({ shadowColor, shadowBlur, shadowOffsetX: 0, shadowOffsetY: 0 });

/** CapCut-style caption templates, shown as tiles in Auto captions. */
export const CAPTION_LOOKS: readonly CaptionLook[] = [
  {
    id: "classic",
    label: "Default",
    style: { fontFamily: "Inter", fontWeight: 700, color: "#ffffff", ...outline("#000000", 5), ...shadow("rgba(0,0,0,0.6)") },
    animation: "none",
  },
  {
    id: "chunky",
    label: "Chunky",
    style: { fontFamily: "Poppins", fontWeight: 900, color: "#ffffff", strokeWidth: 0, ...hardShadow("#000000", 8) },
    animation: "pop",
  },
  {
    id: "green-italic",
    label: "Hype",
    style: { fontFamily: "Montserrat", fontWeight: 900, fontStyle: "italic", color: "#4ade80", ...outline("#000000", 8), ...hardShadow("#000000", 6) },
    animation: "bounce",
    uppercase: true,
  },
  {
    id: "glow",
    label: "Glow",
    style: { fontFamily: "Poppins", fontWeight: 800, color: "#ffffff", strokeWidth: 0, ...glow("#22ff88") },
    animation: "fade",
  },
  {
    id: "dreamy",
    label: "Dreamy",
    style: { fontFamily: "Anton", fontWeight: 400, color: "#ffffff", strokeWidth: 0, ...glow("rgba(255,255,255,0.9)", 22) },
    animation: "blur",
    uppercase: true,
  },
  {
    id: "cyan-italic",
    label: "Sport",
    style: { fontFamily: "Montserrat", fontWeight: 900, fontStyle: "italic", color: "#33d6ff", ...outline("#001a24", 6), ...shadow("rgba(0,0,0,0.7)", 6, 4) },
    animation: "slide-up",
    uppercase: true,
  },
  {
    id: "pop-yellow",
    label: "Pop",
    style: { fontFamily: "Montserrat", fontWeight: 900, color: "#ffe14d", ...outline("#000000", 8), ...hardShadow("#000000", 6) },
    animation: "pop",
  },
  {
    id: "neon",
    label: "Neon",
    style: { fontFamily: "Poppins", fontWeight: 800, color: "#ffffff", ...outline("#ff2fb3", 4), ...glow("#ff2fb3", 24) },
    animation: "fade",
  },
  {
    id: "modern",
    label: "Modern",
    style: { fontFamily: "Modern", fontWeight: 800, color: "#ffffff", ...outline("#000000", 6), ...hardShadow("#7c3aed", 6) },
    animation: "rise",
    uppercase: true,
  },
  {
    id: "blocky",
    label: "Blocky",
    style: { fontFamily: "Boblox Classic", fontWeight: 400, color: "#ffffff", ...outline("#000000", 7), ...hardShadow("#000000", 5) },
    animation: "bounce",
  },
  {
    id: "boxed",
    label: "Boxed",
    style: { fontFamily: "Inter", fontWeight: 800, color: "#ffffff", backgroundColor: "rgba(0,0,0,0.75)", strokeWidth: 0 },
    animation: "slide-up",
  },
  {
    id: "label",
    label: "Label",
    style: { fontFamily: "Poppins", fontWeight: 800, color: "#000000", backgroundColor: "#ffffff", strokeWidth: 0 },
    animation: "pop",
  },
  {
    id: "fire",
    label: "Fire",
    style: { fontFamily: "Bebas Neue", fontWeight: 400, color: "#ffb020", ...outline("#b91c1c", 6), ...glow("#ff4d00", 20) },
    animation: "rise",
    uppercase: true,
  },
  {
    id: "mint",
    label: "Word by word",
    style: { fontFamily: "Montserrat", fontWeight: 800, color: "#7dffcf", ...outline("#05332a", 6), ...shadow("rgba(0,0,0,0.6)") },
    animation: "word-by-word",
  },
  {
    id: "typewriter",
    label: "Typewriter",
    style: { fontFamily: "Space Mono", fontWeight: 700, color: "#ffffff", ...outline("#000000", 3), ...shadow("rgba(0,0,0,0.8)", 6, 2) },
    animation: "typewriter",
  },
  {
    id: "glitch",
    label: "Glitch",
    style: { fontFamily: "Inter", fontWeight: 900, color: "#ffffff", ...outline("#00e5ff", 4), ...hardShadow("#ff0055", 4) },
    animation: "glitch",
  },
];

export const DEFAULT_CAPTION_LOOK = CAPTION_LOOKS[0];

/** A caption size that reads well on a phone: about 7% of the video's short side (76px at 1080p). */
export function captionFontSize(settings: { width: number; height: number }): number {
  return Math.max(24, Math.round(Math.min(settings.width || 1080, settings.height || 1920) * 0.07));
}

export function captionLookById(id: string): CaptionLook {
  return CAPTION_LOOKS.find((look) => look.id === id) ?? DEFAULT_CAPTION_LOOK;
}
