import type { Keyframe, Transform } from "@openreel/core";
import { useProjectStore } from "../../stores/project-store";

/** The transform values CapCut's keyframe button records. */
export const TRANSFORM_PROPS = ["position.x", "position.y", "scale.x", "scale.y", "rotation"] as const;
export type TransformProp = (typeof TRANSFORM_PROPS)[number];
export type FlatTransform = Record<TransformProp, number>;

/** Keyframes closer than this (seconds) count as the same frame. */
const SAME_FRAME = 1 / 60;

export type VisualKind = "media" | "text" | "shape";

/** The selected thing on the preview that gestures and keyframes act on. */
export interface SelectedVisual {
  kind: VisualKind;
  id: string;
  startTime: number;
  duration: number;
  transform: Transform;
  keyframes: readonly Keyframe[];
}

export const flatten = (t: Transform): FlatTransform => ({
  "position.x": t.position.x,
  "position.y": t.position.y,
  "scale.x": t.scale.x,
  "scale.y": t.scale.y,
  rotation: t.rotation,
});

export const unflatten = (f: FlatTransform): Partial<Transform> => ({
  position: { x: f["position.x"], y: f["position.y"] },
  scale: { x: f["scale.x"], y: f["scale.y"] },
  rotation: f.rotation,
});

/** In/Out/Combo animations are keyframes too ("motion-…" ids); they are not the user's keyframes. */
export const isAnimationKeyframe = (kf: Keyframe) => kf.id.startsWith("motion-");

const isTransformKeyframe = (kf: Keyframe) =>
  !isAnimationKeyframe(kf) && (TRANSFORM_PROPS as readonly string[]).includes(kf.property);

export const hasTransformKeyframes = (kfs: readonly Keyframe[]) => kfs.some(isTransformKeyframe);

export const hasKeyframeAt = (kfs: readonly Keyframe[], time: number) =>
  kfs.some((kf) => isTransformKeyframe(kf) && Math.abs(kf.time - time) < SAME_FRAME);

/** Linear value of one property at `time`, or `fallback` when it has no keyframes. */
function valueAt(kfs: readonly Keyframe[], prop: TransformProp, time: number, fallback: number): number {
  const points = kfs
    .filter((kf) => isTransformKeyframe(kf) && kf.property === prop && typeof kf.value === "number")
    .sort((a, b) => a.time - b.time);
  if (points.length === 0) return fallback;
  if (time <= points[0].time) return points[0].value as number;
  const last = points[points.length - 1];
  if (time >= last.time) return last.value as number;
  const next = points.findIndex((kf) => kf.time > time);
  const a = points[next - 1];
  const b = points[next];
  const t = (time - a.time) / (b.time - a.time);
  return (a.value as number) + ((b.value as number) - (a.value as number)) * t;
}

/** The transform showing at clip-local `time`, keyframes included. */
export function currentTransform(visual: SelectedVisual, time: number): FlatTransform {
  const base = flatten(visual.transform);
  const out = { ...base };
  for (const prop of TRANSFORM_PROPS) out[prop] = valueAt(visual.keyframes, prop, time, base[prop]);
  return out;
}

/** Keyframes with every transform value set at `time`. */
export function upsertKeyframes(kfs: readonly Keyframe[], time: number, values: FlatTransform): Keyframe[] {
  const kept = kfs.filter((kf) => !(isTransformKeyframe(kf) && Math.abs(kf.time - time) < SAME_FRAME));
  const added = TRANSFORM_PROPS.map(
    (prop): Keyframe => ({
      id: `kf-${Date.now()}-${prop}-${Math.random().toString(36).slice(2, 7)}`,
      time,
      property: prop,
      value: values[prop],
      easing: "ease-in-out",
    }),
  );
  return [...kept, ...added];
}

export const removeKeyframesAt = (kfs: readonly Keyframe[], time: number): Keyframe[] =>
  kfs.filter((kf) => !(isTransformKeyframe(kf) && Math.abs(kf.time - time) < SAME_FRAME));

/** Find the selected media, text or graphic clip in the project. */
export function findSelectedVisual(id: string | null): SelectedVisual | null {
  if (!id) return null;
  const project = useProjectStore.getState().project;
  for (const track of project.timeline.tracks) {
    const clip = track.clips.find((c) => c.id === id);
    if (clip) {
      if (project.mediaLibrary.items.find((m) => m.id === clip.mediaId)?.type === "audio") return null;
      return { kind: "media", id, startTime: clip.startTime, duration: clip.duration, transform: clip.transform, keyframes: clip.keyframes ?? [] };
    }
  }
  const text = project.textClips?.find((c) => c.id === id);
  if (text) return { kind: "text", id, startTime: text.startTime, duration: text.duration, transform: text.transform, keyframes: text.keyframes ?? [] };
  const graphic = [...(project.shapeClips ?? []), ...(project.svgClips ?? []), ...(project.stickerClips ?? [])].find((c) => c.id === id);
  if (graphic) return { kind: "shape", id, startTime: graphic.startTime, duration: graphic.duration, transform: graphic.transform, keyframes: [] };
  return null;
}

/** Write a transform: into the keyframe at `time` when the clip is keyframed, else into the clip. */
export function applyTransform(visual: SelectedVisual, time: number, values: FlatTransform): void {
  const store = useProjectStore.getState();
  const keyed = visual.kind !== "shape" && hasTransformKeyframes(visual.keyframes);
  if (keyed) {
    const keyframes = upsertKeyframes(visual.keyframes, time, values);
    if (visual.kind === "media") store.updateClipKeyframes(visual.id, keyframes);
    else store.updateTextClipKeyframes(visual.id, keyframes);
    return;
  }
  const transform = unflatten(values);
  // Animations were recorded around the old position and size; carry them along.
  if (visual.kind !== "shape" && visual.keyframes.some(isAnimationKeyframe)) {
    const before = flatten(visual.transform);
    const moved = visual.keyframes.map((kf) => {
      if (!isAnimationKeyframe(kf) || typeof kf.value !== "number") return kf;
      const prop = kf.property as TransformProp;
      if (!(TRANSFORM_PROPS as readonly string[]).includes(prop)) return kf;
      const value = prop.startsWith("scale")
        ? before[prop] !== 0 ? kf.value * (values[prop] / before[prop]) : kf.value
        : kf.value + (values[prop] - before[prop]);
      return { ...kf, value };
    });
    if (visual.kind === "media") store.updateClipKeyframes(visual.id, moved);
    else store.updateTextClipKeyframes(visual.id, moved);
  }
  if (visual.kind === "media") void store.updateClipTransform(visual.id, transform);
  else if (visual.kind === "text") store.updateTextTransform(visual.id, transform);
  else store.updateShapeTransform(visual.id, transform);
}

/** CapCut's keyframe button: add a keyframe at `time`, or remove the one already there. */
export function toggleKeyframe(visual: SelectedVisual, time: number): void {
  if (visual.kind === "shape") return;
  const store = useProjectStore.getState();
  const keyframes = hasKeyframeAt(visual.keyframes, time)
    ? removeKeyframesAt(visual.keyframes, time)
    : upsertKeyframes(visual.keyframes, time, currentTransform(visual, time));
  if (visual.kind === "media") store.updateClipKeyframes(visual.id, keyframes);
  else store.updateTextClipKeyframes(visual.id, keyframes);
}
