import type { Clip } from "@openreel/core";

/**
 * The Android app's LaamacutPreviewPlayer plugin (PreviewPlayerPlugin.java):
 * ExoPlayer drawing the original gallery videos behind a transparent WebView,
 * so the preview plays smoothly without copying frames into a canvas.
 */
export interface PreviewPlayerPlugin {
  load(options: { clips: NativeClip[]; index: number; positionMs: number }): Promise<void>;
  show(options: { x: number; y: number; width: number; height: number; background: string }): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(options: { index: number; positionMs: number }): Promise<void>;
  setSpeed(options: { speed: number }): Promise<void>;
  position(): Promise<{ index?: number; positionMs?: number; playing?: boolean }>;
  release(): Promise<void>;
  /** Writes to the phone's log (tag LaamacutPreview); console output isn't kept in release builds. */
  debug?(options: { message: string }): Promise<void>;
}

export interface NativeClip {
  uri: string;
  inMs: number;
  outMs: number;
}

export function getPreviewPlayer(): PreviewPlayerPlugin | undefined {
  if (typeof window === "undefined") return undefined;
  const plugins = window.Capacitor?.Plugins as { LaamacutPreviewPlayer?: PreviewPlayerPlugin } | undefined;
  return plugins?.LaamacutPreviewPlayer;
}

/** Gaps shorter than this (about a frame) still count as back to back. */
const GAP_TOLERANCE = 0.02;

export interface NativePlan {
  clips: NativeClip[];
  /** Timeline start of each clip, for turning the player's position into timeline time. */
  starts: number[];
  index: number;
  positionMs: number;
  /** Where the run of back-to-back clips ends; playback falls back after this. */
  end: number;
}

const isPlainTransform = (transform: Clip["transform"] | undefined): boolean => {
  if (!transform) return true;
  return (
    (transform.position?.x ?? 0) === 0 &&
    (transform.position?.y ?? 0) === 0 &&
    (transform.scale?.x ?? 1) === 1 &&
    (transform.scale?.y ?? 1) === 1 &&
    (transform.rotation ?? 0) === 0 &&
    (transform.opacity ?? 1) === 1 &&
    (transform.anchor?.x ?? 0.5) === 0.5 &&
    (transform.anchor?.y ?? 0.5) === 0.5 &&
    !transform.borderRadius &&
    !transform.crop &&
    !transform.rotate3d &&
    (transform.fitMode ?? "contain") === "contain"
  );
};

/** Whether the phone's player can show this clip exactly as the web preview would. */
export const clipPlaysNatively = (clip: Clip): boolean =>
  isPlainTransform(clip.transform) &&
  (clip.keyframes?.length ?? 0) === 0 &&
  (!clip.emphasisAnimation || clip.emphasisAnimation.type === "none") &&
  !clip.stabilization?.enabled &&
  !clip.chromaKey?.enabled &&
  Object.keys(clip.colorGrading ?? {}).length === 0 &&
  (clip.blendMode ?? "normal") === "normal" &&
  (clip.blendOpacity ?? 1) === 1 &&
  (clip.speed ?? 1) === 1 &&
  !clip.reversed &&
  !(clip.speedKeyframes?.length) &&
  !(clip.freezeFrames?.length) &&
  !clip.effects.some((effect) => effect.enabled);

/**
 * The run of back-to-back video clips that plays from `position`, as the
 * phone's player wants it. Null when the playhead isn't on a clip, or a clip
 * has no gallery file.
 */
export function planNativePreview(
  clips: readonly Clip[],
  position: number,
  uriOf: (mediaId: string) => string | undefined,
): NativePlan | null {
  const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);
  const first = sorted.findIndex((clip) => position >= clip.startTime && position < clip.startTime + clip.duration);
  if (first < 0) return null;

  const plan: NativePlan = { clips: [], starts: [], index: 0, positionMs: 0, end: 0 };
  let previousEnd = sorted[first].startTime;
  for (let i = first; i < sorted.length; i++) {
    const clip = sorted[i];
    if (clip.startTime - previousEnd > GAP_TOLERANCE) break;
    const uri = uriOf(clip.mediaId);
    if (!uri) {
      if (i === first) return null;
      break;
    }
    plan.clips.push({
      uri,
      inMs: Math.round(clip.inPoint * 1000),
      outMs: Math.round((clip.inPoint + clip.duration) * 1000),
    });
    plan.starts.push(clip.startTime);
    previousEnd = clip.startTime + clip.duration;
  }
  plan.end = previousEnd;
  plan.positionMs = Math.round((position - sorted[first].startTime) * 1000);
  return plan;
}

/** Timeline time of the player's position, or null if it hasn't said. */
export function nativeTimelineTime(plan: NativePlan, index: number | undefined, positionMs: number | undefined): number | null {
  if (index === undefined || positionMs === undefined || index < 0 || index >= plan.starts.length) return null;
  return plan.starts[index] + positionMs / 1000;
}

/** Where a timeline time falls in the plan, for seeking the player. */
export function planSeekTarget(plan: NativePlan, time: number): { index: number; positionMs: number } {
  let index = 0;
  for (let i = 0; i < plan.starts.length; i++) if (time >= plan.starts[i]) index = i;
  return { index, positionMs: Math.max(0, Math.round((time - plan.starts[index]) * 1000)) };
}

/**
 * How to keep the muted phone player in step with the web clock (which the
 * sound follows): a big gap is a seek, a small one a gentle speed change.
 */
export function driftCorrection(drift: number): { seek: true } | { speed: number } {
  if (Math.abs(drift) > 0.25) return { seek: true };
  if (Math.abs(drift) < 0.02) return { speed: 1 };
  return { speed: Math.min(1.05, Math.max(0.95, 1 - drift)) };
}

/**
 * Let the native video show through: the canvas's ancestors stop painting
 * their backgrounds (the native layer paints `background` behind instead).
 * Returns a function that puts everything back.
 */
export function clearAncestorBackgrounds(element: HTMLElement): () => void {
  const changed: { el: HTMLElement; value: string; priority: string }[] = [];
  for (let el: HTMLElement | null = element; el; el = el.parentElement) {
    changed.push({
      el,
      value: el.style.getPropertyValue("background-color"),
      priority: el.style.getPropertyPriority("background-color"),
    });
    el.style.setProperty("background-color", "transparent", "important");
  }
  return () => {
    for (const { el, value, priority } of changed) {
      if (value) el.style.setProperty("background-color", value, priority);
      else el.style.removeProperty("background-color");
    }
  };
}

/** The nearest painted background colour at or above an element. */
export function backgroundBehind(element: HTMLElement): string {
  for (let el: HTMLElement | null = element; el; el = el.parentElement) {
    const color = getComputedStyle(el).backgroundColor;
    if (color && color !== "transparent" && !/rgba\(.*,\s*0\)$/.test(color)) return toHex(color);
  }
  return "#000000";
}

function toHex(color: string): string {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return color.startsWith("#") ? color : "#000000";
  return `#${match.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
}
