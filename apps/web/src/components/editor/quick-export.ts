// CapCut-style export choices: resolution by short side, and a bitrate level
// instead of a raw kbps number.

export type QuickBitrateLevel = "lower" | "recommended" | "higher" | "custom";

export const QUICK_RESOLUTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 480, label: "480p" },
  { value: 720, label: "720p" },
  { value: 1080, label: "1080p" },
  { value: 1440, label: "2K" },
  { value: 2160, label: "4K" },
];

export const QUICK_BITRATE_LEVELS: ReadonlyArray<{ value: QuickBitrateLevel; label: string }> = [
  { value: "lower", label: "Lower" },
  { value: "recommended", label: "Recommended" },
  { value: "higher", label: "Higher" },
  { value: "custom", label: "Customize" },
];

const BITS_PER_PIXEL: Record<Exclude<QuickBitrateLevel, "custom">, number> = {
  lower: 0.06,
  recommended: 0.12,
  higher: 0.24,
};

export const MIN_QUICK_BITRATE_KBPS = 1000;
export const MAX_QUICK_BITRATE_KBPS = 150000;

const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);

/** Scales the project canvas so its short side equals `shortSide`, keeping the aspect ratio. */
export function quickExportSize(
  projectWidth: number,
  projectHeight: number,
  shortSide: number,
): { width: number; height: number } {
  const scale = shortSide / Math.min(projectWidth, projectHeight);
  return { width: even(projectWidth * scale), height: even(projectHeight * scale) };
}

/** The listed resolutions, plus the project's own size when it isn't one of them. */
export function quickResolutionOptions(
  projectWidth: number,
  projectHeight: number,
): Array<{ value: number; label: string }> {
  const shortSide = Math.min(projectWidth, projectHeight);
  if (QUICK_RESOLUTIONS.some((option) => option.value === shortSide)) return [...QUICK_RESOLUTIONS];
  return [
    ...QUICK_RESOLUTIONS,
    { value: shortSide, label: `Project (${projectWidth}×${projectHeight})` },
  ].sort((a, b) => a.value - b.value);
}

/** The largest listed resolution that doesn't upscale the project. */
export function defaultQuickResolution(projectWidth: number, projectHeight: number): number {
  const shortSide = Math.min(projectWidth, projectHeight);
  const fitting = QUICK_RESOLUTIONS.filter((option) => option.value <= shortSide);
  return fitting.at(-1)?.value ?? shortSide;
}

export function quickBitrateKbps(
  width: number,
  height: number,
  frameRate: number,
  level: Exclude<QuickBitrateLevel, "custom">,
): number {
  const kbps = (width * height * frameRate * BITS_PER_PIXEL[level]) / 1000;
  const rounded = Math.round(kbps / 100) * 100;
  return Math.min(MAX_QUICK_BITRATE_KBPS, Math.max(MIN_QUICK_BITRATE_KBPS, rounded));
}
