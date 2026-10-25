import { useRef, useState } from "react";
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
  /** Twist to ignore in this stretch of the gesture: the dead zone, until rotation has started. */
  twistOffset: number | null;
}

const TAP_SLOP = 6;
/** How close (screen px) the centre has to come to the frame's centre lines to snap. */
const SNAP_DISTANCE = 10;
/** A pinch only starts rotating once the fingers twist this far (degrees), so zooming doesn't tilt. */
const ROTATE_START = 12;
/** Rotation clicks onto 0°, 90°, 180° and 270° within this many degrees. */
const ROTATE_SNAP = 5;

/** Degrees between -180 and 180. */
const wrap = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

type Guides = { x: boolean; y: boolean };
type Box = { left: number; top: number; width: number; height: number };

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
  const snappedAngle = useRef<number | null>(null);
  const [guides, setGuides] = useState<Guides>({ x: false, y: false });
  /** The video frame inside this overlay, where the guide lines are drawn. */
  const [frameBox, setFrameBox] = useState<Box | null>(null);
  const guidesRef = useRef<Guides>({ x: false, y: false });
  const showGuides = (next: Guides) => {
    const was = guidesRef.current;
    if (was.x === next.x && was.y === next.y) return;
    // A tiny buzz as it clicks into place, like CapCut.
    if ((next.x && !was.x) || (next.y && !was.y)) navigator.vibrate?.(8);
    guidesRef.current = next;
    setGuides(next);
  };

  // Restart from the current fingers whenever one is added or lifted, so the
  // clip doesn't jump between one-finger drag and two-finger pinch.
  const begin = (target: HTMLElement) => {
    const visual = findSelectedVisual(selectedId);
    const screen = target.parentElement?.querySelector("[data-preview-screen]")?.getBoundingClientRect();
    if (!visual || !screen || screen.width === 0) {
      gesture.current = null;
      return;
    }
    const box = target.getBoundingClientRect();
    setFrameBox({ left: screen.left - box.left, top: screen.top - box.top, width: screen.width, height: screen.height });
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
      // Once rotation has started it carries on from the new fingers with no dead zone.
      twistOffset: previous && gesture.current?.twistOffset !== null && gesture.current?.twistOffset !== undefined ? 0 : null,
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
    // Snap the centre onto the frame's vertical and horizontal centre lines.
    // Media positions are offsets from the centre; text and graphics are 0..1.
    const centreValue = g.visual.kind === "media" ? 0 : 0.5;
    const snapX = Math.abs(next["position.x"] - centreValue) <= SNAP_DISTANCE * g.perPixel.x;
    const snapY = Math.abs(next["position.y"] - centreValue) <= SNAP_DISTANCE * g.perPixel.y;
    if (snapX) next["position.x"] = centreValue;
    if (snapY) next["position.y"] = centreValue;
    showGuides({ x: snapX, y: snapY });
    if (now.length >= 2) {
      const zoom = spread(is[0], is[1]) / Math.max(1, spread(was[0], was[1]));
      next["scale.x"] = Math.max(0.05, g.start["scale.x"] * zoom);
      next["scale.y"] = Math.max(0.05, g.start["scale.y"] * zoom);
      const twist = wrap(angle(is[0], is[1]) - angle(was[0], was[1]));
      if (g.twistOffset === null && Math.abs(twist) >= ROTATE_START) g.twistOffset = Math.sign(twist) * ROTATE_START;
      if (g.twistOffset !== null) {
        let rotation = g.start.rotation + twist - g.twistOffset;
        const square = Math.round(rotation / 90) * 90;
        const snapped = Math.abs(rotation - square) <= ROTATE_SNAP;
        if (snapped) rotation = square;
        if (snapped && snappedAngle.current !== square) navigator.vibrate?.(8);
        snappedAngle.current = snapped ? square : null;
        next.rotation = rotation;
      }
    }
    pending.current = next;
    if (frame.current === null) frame.current = requestAnimationFrame(flush);
  };

  /** Apply the latest move now (once per frame, and when the finger lifts). */
  const flush = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    const live = gesture.current;
    if (live && pending.current) applyTransform(findSelectedVisual(live.visual.id) ?? live.visual, live.time, pending.current);
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
    if (g?.moved) flush();
    if (pointers.current.size > 0) {
      begin(e.currentTarget);
      return;
    }
    if (g && !g.moved && g.visual.kind === "text") onTapText(g.visual.id);
    gesture.current = null;
    pending.current = null;
    showGuides({ x: false, y: false });
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
    >
      {frameBox && (guides.x || guides.y) && (
        <div aria-hidden className="pointer-events-none absolute" style={frameBox}>
          {guides.x && <span data-testid="snap-guide-x" className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--accent)]" />}
          {guides.y && <span data-testid="snap-guide-y" className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[var(--accent)]" />}
        </div>
      )}
    </div>
  );
}

