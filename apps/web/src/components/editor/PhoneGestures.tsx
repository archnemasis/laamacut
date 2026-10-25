import { useRef } from "react";
import { useProjectStore } from "../../stores/project-store";
import { useTimelineStore } from "../../stores/timeline-store";
import { applyTransform, currentTransform, findSelectedVisual, type FlatTransform, type SelectedVisual } from "./phone-keyframes";

type Point = { x: number; y: number };

interface Gesture {
  visual: SelectedVisual;
  time: number;
  start: FlatTransform;
  /** Screen pixels → transform units, per axis. */
  perPixel: Point;
  origin: Map<number, Point>;
  moved: boolean;
}

const TAP_SLOP = 6;

const centre = (points: Point[]): Point => ({
  x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
  y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
});
const spread = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const angle = (a: Point, b: Point) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

/**
 * CapCut's preview gestures for the selected clip or text: drag with one
 * finger to move it, pinch to resize, twist two fingers to rotate. A tap on
 * selected text opens the text editor.
 */
export function PhoneGestures({ selectedId, onTapText }: { selectedId: string; onTapText: (id: string) => void }) {
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const frame = useRef<number | null>(null);
  const pending = useRef<FlatTransform | null>(null);

  // Restart from the current fingers whenever one is added or lifted, so the
  // clip doesn't jump between one-finger drag and two-finger pinch.
  const begin = (target: HTMLElement) => {
    const visual = findSelectedVisual(selectedId);
    const screen = target.parentElement?.querySelector("[data-preview-screen]")?.getBoundingClientRect();
    if (!visual || !screen || screen.width === 0) {
      gesture.current = null;
      return;
    }
    const { settings } = useProjectStore.getState().project;
    const time = useTimelineStore.getState().playheadPosition - visual.startTime;
    const previous = gesture.current?.visual.id === visual.id ? pending.current : null;
    gesture.current = {
      visual,
      time,
      start: previous ?? currentTransform(visual, time),
      // Media clips move in project pixels; text and graphics in fractions of the frame.
      perPixel:
        visual.kind === "media"
          ? { x: settings.width / screen.width, y: settings.height / screen.height }
          : { x: 1 / screen.width, y: 1 / screen.height },
      origin: new Map(pointers.current),
      moved: gesture.current?.moved ?? false,
    };
  };

  const update = () => {
    const g = gesture.current;
    if (!g) return;
    const now = [...pointers.current.entries()].filter(([id]) => g.origin.has(id));
    if (now.length === 0) return;
    const was = now.map(([id]) => g.origin.get(id)!);
    const is = now.map(([, p]) => p);
    const shift = { x: centre(is).x - centre(was).x, y: centre(is).y - centre(was).y };
    if (Math.hypot(shift.x, shift.y) > TAP_SLOP || now.length > 1) g.moved = true;
    if (!g.moved) return;

    const next = { ...g.start };
    next["position.x"] = g.start["position.x"] + shift.x * g.perPixel.x;
    next["position.y"] = g.start["position.y"] + shift.y * g.perPixel.y;
    if (now.length >= 2) {
      const zoom = spread(is[0], is[1]) / Math.max(1, spread(was[0], was[1]));
      next["scale.x"] = Math.max(0.05, g.start["scale.x"] * zoom);
      next["scale.y"] = Math.max(0.05, g.start["scale.y"] * zoom);
      next.rotation = g.start.rotation + (angle(is[0], is[1]) - angle(was[0], was[1]));
    }
    pending.current = next;
    if (frame.current === null) {
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        const live = gesture.current;
        if (live && pending.current) applyTransform(findSelectedVisual(live.visual.id) ?? live.visual, live.time, pending.current);
      });
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a nicety; the gesture still works without it.
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const timeline = useTimelineStore.getState();
    if (timeline.playbackState === "playing") timeline.pause();
    begin(e.currentTarget);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    update();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size > 0) {
      begin(e.currentTarget);
      return;
    }
    if (g && !g.moved && g.visual.kind === "text") onTapText(g.visual.id);
    gesture.current = null;
    pending.current = null;
  };

  return (
    <div
      data-testid="phone-gestures"
      aria-hidden
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="absolute inset-0 z-20"
      style={{ touchAction: "none" }}
    />
  );
}
