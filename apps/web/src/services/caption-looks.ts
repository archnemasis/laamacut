import type { TextAnimationPreset, TextStyle } from "@openreel/core";

/** A ready-made caption style: colours, outline, shadow and how each caption comes in. */
export interface CaptionLook {
  readonly id: string;
  readonly label: string;
  readonly style: Partial<TextStyle>;
  readonly animation: TextAnimationPreset;
}

const outline = (strokeColor: string, strokeWidth = 6): Partial<TextStyle> => ({ strokeColor, strokeWidth });
const shadow = (shadowColor: string, shadowBlur = 12, shadowOffsetY = 4): Partial<TextStyle> => ({
  shadowColor,
  shadowBlur,
  shadowOffsetX: 0,
  shadowOffsetY,
});

/** CapCut-style caption presets, shown as tiles in Auto captions. */
export const CAPTION_LOOKS: readonly CaptionLook[] = [
  {
    id: "classic",
    label: "Classic",
    style: { fontFamily: "Inter", fontWeight: 700, color: "#ffffff", ...outline("#000000", 5), ...shadow("rgba(0,0,0,0.6)") },
    animation: "none",
  },
  {
    id: "pop-yellow",
    label: "Pop",
    style: { fontFamily: "Montserrat", fontWeight: 900, color: "#ffe14d", ...outline("#000000", 8), ...shadow("rgba(0,0,0,0.7)", 0, 6) },
    animation: "pop",
  },
  {
    id: "neon",
    label: "Neon",
    style: { fontFamily: "Poppins", fontWeight: 800, color: "#ffffff", ...outline("#ff2fb3", 4), ...shadow("#ff2fb3", 24, 0) },
    animation: "fade",
  },
  {
    id: "boxed",
    label: "Boxed",
    style: { fontFamily: "Inter", fontWeight: 700, color: "#ffffff", backgroundColor: "rgba(0,0,0,0.75)", strokeWidth: 0 },
    animation: "slide-up",
  },
  {
    id: "bubble",
    label: "Bubble",
    style: { fontFamily: "Poppins", fontWeight: 800, color: "#ffffff", ...outline("#3b82f6", 9), ...shadow("rgba(0,0,0,0.5)", 0, 5) },
    animation: "bounce",
  },
  {
    id: "fire",
    label: "Fire",
    style: { fontFamily: "Bebas Neue", fontWeight: 400, color: "#ffb020", ...outline("#b91c1c", 6), ...shadow("#ff4d00", 20, 0) },
    animation: "rise",
  },
  {
    id: "mint",
    label: "Mint",
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
    style: { fontFamily: "Inter", fontWeight: 900, color: "#ffffff", ...outline("#00e5ff", 4), ...shadow("#ff0055", 0, 4) },
    animation: "glitch",
  },
  {
    id: "soft",
    label: "Soft",
    style: { fontFamily: "Inter", fontWeight: 600, color: "#ffffff", strokeWidth: 0, ...shadow("rgba(0,0,0,0.85)", 18, 3) },
    animation: "blur",
  },
];

export const DEFAULT_CAPTION_LOOK = CAPTION_LOOKS[0];

export function captionLookById(id: string): CaptionLook {
  return CAPTION_LOOKS.find((look) => look.id === id) ?? DEFAULT_CAPTION_LOOK;
}
