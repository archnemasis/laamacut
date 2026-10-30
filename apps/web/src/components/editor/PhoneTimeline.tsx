import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Music, Pencil, Plus, Type, Volume2, VolumeX } from "@/icons/lucide-compat";
import { animationSpans } from "./phone-keyframes";
import { getProjectPreview, setProjectCover } from "../../services/project-previews";
import { PhoneCoverScreen } from "./PhoneCoverScreen";
import { reorderTrackClips } from "../../services/phone-media";
import { haptic } from "../../services/haptics";
import { ensureFilmstrip } from "../../services/filmstrip";
import { toast } from "../../stores/notification-store";
import type { Clip, MediaItem } from "@openreel/core";
import { useProjectStore } from "../../stores/project-store";
import { useTimelineStore } from "../../stores/timeline-store";
import { useUIStore } from "../../stores/ui-store";

const MIN_PPS = 12;
const MAX_PPS = 400;
const DEFAULT_PPS = 56;
const MAIN_LANE_H = 56;
const LANE_H = 36;
const MIN_TRIM = 0.1;
/** How close (screen px) a dragged edge or block has to come to another edge to click onto it. */
const SNAP_PX = 12;
/** A lane with more blocks than this is stepped through with Previous/Next for screen readers, not dozens of overlapping buttons. */
const MANY_BLOCKS = 6;

/** A half-saved clip can briefly have no time; place it at 0 rather than at NaN px. */
const finite = (value: number | undefined): number => (Number.isFinite(value) ? (value as number) : 0);

type LaneItem = { id: string; start: number; duration: number; label: string; kind?: "text-clip" | "shape-clip"; clip?: Clip };
type TrimDraft = { id: string; side: "start" | "end"; delta: number };
type TrimSide = TrimDraft["side"];

/**
 * Like CapCut, the part of a clip an animation covers is shaded, with arrows
 * pointing the way it plays: in at the start, out at the end, both for combo.
 */
function AnimationBands({ clip, pps, offset = 0 }: { clip: Clip; pps: number; offset?: number }) {
  return (
    <>
      {animationSpans(clip.keyframes).map((span) => {
        const Arrow = span.kind === "out" ? ChevronsLeft : span.kind === "in" ? ChevronsRight : ArrowLeftRight;
        return (
          <span
            key={span.kind}
            data-testid={`animation-${span.kind}`}
            aria-hidden
            className={`pointer-events-none absolute inset-y-0 flex items-center overflow-hidden bg-black/45 text-white ${
              span.kind === "out" ? "justify-start border-l border-white/70 pl-0.5" : span.kind === "in" ? "justify-end border-r border-white/70 pr-0.5" : "justify-center"
            }`}
            style={{ left: (span.start - offset) * pps, width: Math.max(2, (span.end - span.start) * pps) }}
          >
            <Arrow size={14} strokeWidth={2.5} className="shrink-0" />
          </span>
        );
      })}
    </>
  );
}

/** CapCut's white trim handle, stuck to the side of the selected block with an arrow on it. */
function TrimHandle({ side, value, onPointerDown }: { side: TrimSide; value: number; onPointerDown: (e: React.PointerEvent) => void }) {
  const Arrow = side === "start" ? ChevronLeft : ChevronRight;
  return (
    <span
      role="slider"
      aria-label={side === "start" ? "Trim start" : "Trim end"}
      aria-valuenow={Math.round(value * 10) / 10}
      onPointerDown={onPointerDown}
      onClick={(e) => e.stopPropagation()}
      className={`absolute inset-y-0 z-10 grid w-4 touch-none place-items-center bg-white text-black ${
        side === "start" ? "-left-4 rounded-l-md" : "-right-4 rounded-r-md"
      }`}
    >
      <Arrow size={14} strokeWidth={3} aria-hidden />
    </span>
  );
}

/** The playhead's time, re-rendering once a second rather than every frame. */
function PhoneCurrentTime() {
  const seconds = useTimelineStore((s) => Math.floor(s.playheadPosition));
  return <span className="text-fg">{formatPhoneTime(seconds)}</span>;
}

export const formatPhoneTime = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

/** Ruler label spacing for the current zoom, in seconds. */
const labelStep = (pps: number): number =>
  pps >= 160 ? 0.5 : pps >= 80 ? 1 : pps >= 36 ? 2 : pps >= 18 ? 5 : 10;

function thumbnailAt(media: MediaItem | undefined, time: number): string | undefined {
  const strip = media?.filmstripThumbnails;
  if (strip && strip.length > 0) {
    let best = strip[0];
    for (const frame of strip) {
      if (Math.abs(frame.timestamp - time) < Math.abs(best.timestamp - time)) best = frame;
    }
    return best.url;
  }
  return media?.thumbnailUrl ?? undefined;
}

/**
 * CapCut-style phone timeline: the playhead stays fixed in the middle and
 * the timeline scrolls under it. Swiping scrubs, pinching zooms, tapping a
 * clip selects it, and a selected media clip gets trim handles.
 */
export function PhoneTimeline({
  onAddMedia,
  onAddAudio,
  onAddText,
}: {
  onAddMedia: () => void;
  onAddAudio: () => void;
  onAddText: () => void;
}) {
  const project = useProjectStore((s) => s.project);
  const trimClip = useProjectStore((s) => s.trimClip);
  const updateOverlayClipTiming = useProjectStore((s) => s.updateOverlayClipTiming);
  const moveClip = useProjectStore((s) => s.moveClip);
  const muteTrack = useProjectStore((s) => s.muteTrack);
  const selectedItems = useUIStore((s) => s.selectedItems);
  const select = useUIStore((s) => s.select);
  const clearSelection = useUIStore((s) => s.clearSelection);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  const [pps, setPps] = useState(DEFAULT_PPS);
  const [trim, setTrim] = useState<TrimDraft | null>(null);
  const userScrollingRef = useRef(false);
  const userScrollTimer = useRef<number | undefined>(undefined);
  const pinchRef = useRef<{ distance: number; pps: number } | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  // Long-press a main clip, then drag it sideways to reorder (CapCut). Other
  // blocks (overlays, audio, text) long-press to slide along the timeline.
  const [drag, setDrag] = useState<{ id: string; dx: number } | null>(null);
  const dragRef = useRef<{ id: string; x0: number; dx: number } | null>(null);
  /** The time a dragged edge or block has clicked onto, drawn as a guide line. */
  const [snapLine, setSnapLine] = useState<number | null>(null);
  const lastSnap = useRef<number | null>(null);
  const pressTimer = useRef<number | undefined>(undefined);
  const [cover, setCover] = useState(() => getProjectPreview(project.id)?.cover ? getProjectPreview(project.id)?.image ?? null : null);

  // While reordering, stop the finger from scrolling the timeline.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const block = (e: TouchEvent) => {
      if (dragRef.current) e.preventDefault();
    };
    el.addEventListener("touchmove", block, { passive: false });
    return () => el.removeEventListener("touchmove", block);
  }, []);

  const half = width / 2;
  // A reopened project can report 0 until its next edit, so also measure the clips.
  const duration = Math.max(
    finite(project.timeline.duration),
    ...project.timeline.tracks.flatMap((t) => t.clips.map((c) => finite(c.startTime) + finite(c.duration))),
    0,
  );
  const selectedIds = useMemo(
    () => new Set(selectedItems.filter((i) => i.type === "clip" || i.type === "text-clip" || i.type === "shape-clip").map((i) => i.id)),
    [selectedItems],
  );
  const mediaById = useMemo(
    () => new Map(project.mediaLibrary.items.map((m) => [m.id, m] as const)),
    [project.mediaLibrary.items],
  );
  // Videos on the timeline without a filmstrip (reopened projects) get one,
  // after a moment so a fresh import's own thumbnails can land first.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const used = new Set(project.timeline.tracks.flatMap((t) => t.clips.map((c) => c.mediaId)));
      for (const media of project.mediaLibrary.items) if (used.has(media.id)) ensureFilmstrip(media);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [project.mediaLibrary.items, project.timeline.tracks]);

  // The main lane is the first track holding pictures; other picture tracks are
  // overlays, audio clips go in the audio lane, and titles/graphics in the text lane.
  const lanes = useMemo(() => {
    const kindOf = (clip: Clip) => mediaById.get(clip.mediaId)?.type ?? "video";
    const tracks = project.timeline.tracks;
    const mainTrack =
      tracks.find((t) => t.clips.some((c) => kindOf(c) !== "audio")) ??
      tracks.find((t) => t.type === "video");
    const overlay: LaneItem[] = [];
    const audio: LaneItem[] = [];
    for (const track of tracks) {
      for (const clip of track.clips) {
        const item = {
          id: clip.id,
          start: finite(clip.startTime),
          duration: finite(clip.duration),
          label: mediaById.get(clip.mediaId)?.name ?? "Clip",
          clip,
        };
        if (kindOf(clip) === "audio") audio.push(item);
        else if (track !== mainTrack) overlay.push(item);
      }
    }
    const at = (c: { id: string; startTime: number; duration: number }) => ({ id: c.id, start: finite(c.startTime), duration: finite(c.duration) });
    const text: LaneItem[] = [
      ...(project.textClips ?? []).map((c) => ({ ...at(c), label: c.text || "Text", kind: "text-clip" as const })),
      ...(project.shapeClips ?? []).map((c) => ({ ...at(c), label: "Shape", kind: "shape-clip" as const })),
      ...(project.svgClips ?? []).map((c) => ({ ...at(c), label: "Graphic", kind: "shape-clip" as const })),
      ...(project.stickerClips ?? []).map((c) => ({ ...at(c), label: "Sticker", kind: "shape-clip" as const })),
    ];
    const main = (mainTrack?.clips ?? []).filter((c) => kindOf(c) !== "audio");
    return { mainTrack, main, overlay, audio, text };
  }, [project, mediaById]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  // Follow the playhead unless the user is swiping the timeline. Done outside
  // React, so playback doesn't re-render the whole timeline on every frame.
  useEffect(() => {
    const follow = (position: number) => {
      const el = scrollRef.current;
      if (el && !userScrollingRef.current) el.scrollLeft = position * pps;
    };
    follow(useTimelineStore.getState().playheadPosition);
    return useTimelineStore.subscribe((state, previous) => {
      if (state.playheadPosition !== previous.playheadPosition) follow(state.playheadPosition);
    });
  }, [pps, width]);

  const markUserScroll = useCallback(() => {
    userScrollingRef.current = true;
    window.clearTimeout(userScrollTimer.current);
    userScrollTimer.current = window.setTimeout(() => {
      userScrollingRef.current = false;
    }, 250);
  }, []);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || !userScrollingRef.current) return;
    markUserScroll();
    const timeline = useTimelineStore.getState();
    if (timeline.playbackState === "playing") timeline.pause();
    timeline.seekTo(Math.min(duration, Math.max(0, el.scrollLeft / pps)));
  };

  // Two fingers pinch to zoom; ctrl+wheel (trackpad pinch) does the same.
  const onPointerDown = (e: React.PointerEvent) => {
    markUserScroll();
    if (e.pointerType !== "touch") return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.current.size === 2) {
      const [a, b] = [...touches.current.values()];
      pinchRef.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), pps };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!touches.current.has(e.pointerId)) return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pinch = pinchRef.current;
    if (pinch && touches.current.size === 2) {
      const [a, b] = [...touches.current.values()];
      const scale = Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch.distance);
      setPps(Math.min(MAX_PPS, Math.max(MIN_PPS, pinch.pps * scale)));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    touches.current.delete(e.pointerId);
    if (touches.current.size < 2) pinchRef.current = null;
  };
  const onWheel = (e: React.WheelEvent) => {
    markUserScroll();
    if (!e.ctrlKey) return;
    setPps((p) => Math.min(MAX_PPS, Math.max(MIN_PPS, p * (e.deltaY < 0 ? 1.1 : 0.9))));
  };

  const selectClip = (id: string, trackId?: string) => {
    if (selectedIds.has(id) && selectedIds.size === 1) clearSelection();
    else select({ type: "clip", id, trackId });
  };

  /**
   * How far each side of a block can move, and how to save it. Videos and audio
   * only stretch back out to the length of their file; pictures, text and
   * stickers stretch as far as you like. Main clips stay end to end (CapCut's
   * magnetic main track), so trimming one moves the clips after it.
   */
  const trimTarget = (item: { id: string; start: number; duration: number; clip?: Clip; main?: boolean }) => {
    const { id, start, duration, clip, main } = item;
    const media = clip ? mediaById.get(clip.mediaId) : undefined;
    const stretchy = !clip || media?.type === "image";
    const sourceLength = media?.metadata?.duration;
    const maxOut = sourceLength && sourceLength > 0 ? sourceLength : Infinity;
    const inPoint = clip?.inPoint ?? 0;
    const minStart = main ? (stretchy ? -Infinity : -inPoint) : stretchy ? -start : Math.max(-start, -inPoint);
    const maxEnd = stretchy || !clip ? Infinity : maxOut - clip.outPoint;
    const commit = async (side: TrimSide, delta: number) => {
      const newDuration = side === "start" ? duration - delta : duration + delta;
      if (!clip) {
        updateOverlayClipTiming(id, { ...(side === "start" ? { startTime: start + delta } : {}), duration: newDuration });
        return;
      }
      if (stretchy) await trimClip(id, 0, newDuration);
      else if (side === "start") await trimClip(id, clip.inPoint + delta, undefined);
      else await trimClip(id, undefined, clip.outPoint + delta);
      if (main && lanes.mainTrack) {
        const order = [...lanes.main].sort((a, b) => a.startTime - b.startTime).map((c) => c.id);
        await reorderTrackClips(lanes.mainTrack.id, order);
      } else if (side === "start") {
        await moveClip(id, start + delta);
      }
    };
    return { id, start, duration, main: !!main, minStart, maxEnd, commit };
  };

  /**
   * Edges a dragged block or trim handle clicks onto: the start, the playhead,
   * and the ends of every other block, so text or music can be cut exactly to
   * the end of a video. Main clips stay end to end, so their own joins count too.
   */
  const snapPoints = (exclude: string): number[] => {
    const points = [0, useTimelineStore.getState().playheadPosition];
    const edges = (start: number, length: number) => points.push(start, start + length);
    for (const c of lanes.main) if (c.id !== exclude) edges(finite(c.startTime), finite(c.duration));
    for (const item of [...lanes.overlay, ...lanes.audio, ...lanes.text]) if (item.id !== exclude) edges(item.start, item.duration);
    return points;
  };

  /** The nearest snap point within reach of `time`, or null. */
  const snapTime = (time: number, points: number[]): number | null => {
    let best: number | null = null;
    for (const point of points) {
      if (Math.abs(point - time) * pps <= SNAP_PX && (best === null || Math.abs(point - time) < Math.abs(best - time))) best = point;
    }
    return best;
  };

  /** Show the guide line, with a tiny buzz as it clicks onto a new edge. */
  const showSnap = (time: number | null) => {
    if (time !== null && time !== lastSnap.current) haptic("tick");
    lastSnap.current = time;
    setSnapLine(time);
  };

  const beginTrim = (target: ReturnType<typeof trimTarget>, side: TrimSide) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const points = snapPoints(target.id);
    // A main clip's start always stays joined to the clip before it, so only its end snaps.
    const snaps = side === "end" || !target.main;
    const edge = side === "start" ? target.start : target.start + target.duration;
    const clampDelta = (raw: number) =>
      side === "start"
        ? Math.min(target.duration - MIN_TRIM, Math.max(target.minStart, raw))
        : Math.min(target.maxEnd, Math.max(-(target.duration - MIN_TRIM), raw));
    const resolve = (ev: PointerEvent) => {
      const raw = (ev.clientX - startX) / pps;
      const snapped = snaps ? snapTime(edge + raw, points) : null;
      const delta = clampDelta(snapped === null ? raw : snapped - edge);
      showSnap(snapped !== null && Math.abs(edge + delta - snapped) < 1e-6 ? snapped : null);
      return delta;
    };
    const move = (ev: PointerEvent) => setTrim({ id: target.id, side, delta: resolve(ev) });
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const delta = resolve(ev);
      setTrim(null);
      showSnap(null);
      if (Math.abs(delta) < 1 / 60) return;
      void target.commit(side, delta);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  /** A block's place while one of its sides is being dragged. */
  const drafted = (id: string, start: number, duration: number) => {
    const draft = trim?.id === id ? trim : null;
    const startDelta = draft?.side === "start" ? draft.delta : 0;
    const endDelta = draft?.side === "end" ? draft.delta : 0;
    return { start: start + startDelta, duration: duration - startDelta + endDelta, startDelta };
  };

  const justDragged = useRef(false);

  /** Drop a dragged main clip: order the clips by their centres, with the dragged one shifted. */
  const dropClip = async (id: string, dx: number) => {
    const track = lanes.mainTrack;
    if (!track) return;
    const clips = [...lanes.main].sort((a, b) => a.startTime - b.startTime);
    const centreOf = (c: Clip) => c.startTime + c.duration / 2 + (c.id === id ? dx / pps : 0);
    const order = [...clips].sort((a, b) => centreOf(a) - centreOf(b)).map((c) => c.id);
    if (order.every((clipId, i) => clipId === clips[i].id)) return;
    await reorderTrackClips(track.id, order);
  };

  /**
   * Hold a block still for a moment, then drag it sideways. `place` turns the
   * finger's travel (px) into how far the block shows as moved (px), so a
   * block can click onto snap points; `drop` saves it.
   */
  const holdToDrag = (
    e: React.PointerEvent,
    id: string,
    place: (dx: number) => number,
    drop: (dx: number) => Promise<void> | void,
    onBegin?: () => void,
  ) => {
    const x0 = e.clientX;
    const y0 = e.clientY;
    const cleanup = () => {
      window.clearTimeout(pressTimer.current);
      window.removeEventListener("pointermove", cancelIfMoved);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
    };
    const cancelIfMoved = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) cleanup();
    };
    cleanup();
    window.addEventListener("pointermove", cancelIfMoved);
    window.addEventListener("pointerup", cleanup);
    window.addEventListener("pointercancel", cleanup);
    pressTimer.current = window.setTimeout(() => {
      cleanup();
      haptic("heavy");
      onBegin?.();
      dragRef.current = { id, x0, dx: 0 };
      setDrag({ id, dx: 0 });
      const move = (ev: PointerEvent) => {
        if (!dragRef.current) return;
        dragRef.current.dx = place(ev.clientX - x0);
        setDrag({ id, dx: dragRef.current.dx });
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        const done = dragRef.current;
        dragRef.current = null;
        setDrag(null);
        showSnap(null);
        justDragged.current = true;
        window.setTimeout(() => (justDragged.current = false), 50);
        if (done && Math.abs(done.dx) >= 1) void drop(done.dx);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    }, 380);
  };

  const startPress = (clip: Clip) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (lanes.main.length < 2) return;
    holdToDrag(e, clip.id, (dx) => dx, (dx) => dropClip(clip.id, dx));
  };

  /** Overlays, audio and text: hold, then slide along the timeline; either end clicks onto other edges. */
  const startBarPress = (item: LaneItem) => (e: React.PointerEvent<HTMLDivElement>) => {
    const points = snapPoints(item.id);
    const place = (dx: number) => {
      const shift = Math.max(-item.start, dx / pps);
      const startSnap = snapTime(item.start + shift, points);
      const endSnap = startSnap === null ? snapTime(item.start + item.duration + shift, points) : null;
      const snapped = startSnap !== null ? startSnap - item.start : endSnap !== null ? endSnap - item.start - item.duration : shift;
      const moved = Math.max(-item.start, snapped);
      showSnap(startSnap ?? endSnap);
      return moved * pps;
    };
    const drop = async (dx: number) => {
      const start = Math.max(0, item.start + dx / pps);
      if (item.clip) await moveClip(item.id, start);
      else updateOverlayClipTiming(item.id, { startTime: start, duration: item.duration });
    };
    const pick = () => (item.kind ? select({ type: item.kind, id: item.id }) : select({ type: "clip", id: item.id, trackId: item.clip?.trackId }));
    holdToDrag(e, item.id, place, drop, pick);
  };

  /** CapCut's Cover: a frame of the video, or a picture from the device, shown on the home screen. */
  const [coverOpen, setCoverOpen] = useState(false);
  const saveCover = (picture: HTMLCanvasElement) => {
    const image = setProjectCover(project, picture);
    setCoverOpen(false);
    if (!image) return;
    setCover(image);
    toast.success("Cover set", "It now shows on your home screen.");
  };
  const mainThumbAt = (time: number) => {
    const clip = lanes.main.find((c) => time >= c.startTime && time < c.startTime + c.duration) ?? lanes.main.at(-1);
    return clip ? thumbnailAt(mediaById.get(clip.mediaId), (clip.inPoint ?? 0) + Math.max(0, time - clip.startTime)) : undefined;
  };
  const coverImage = cover ?? thumbnailAt(mediaById.get(lanes.main[0]?.mediaId ?? ""), 0);

  const step = labelStep(pps);
  const rulerEnd = Math.max(duration, (width / pps) * 0.6);
  const ticks: number[] = [];
  for (let t = 0; t <= rulerEnd + step; t += step / 2) ticks.push(Math.round(t * 1000) / 1000);

  const mainMuted = lanes.mainTrack?.muted ?? false;
  const contentWidth = Math.max(duration, 0.1) * pps;

  const renderBar = (item: LaneItem, tone: string, quiet = false) => {
    const selected = selectedIds.has(item.id);
    const place = drafted(item.id, item.start, item.duration);
    const target = selected ? trimTarget(item) : null;
    const dragging = drag?.id === item.id;
    return (
      <div
        key={item.id}
        aria-hidden={quiet && !selected ? true : undefined}
        onPointerDown={startBarPress(item)}
        onContextMenu={(e) => e.preventDefault()}
        className={`absolute top-1 bottom-1 select-none ${selected ? "z-20" : ""} ${dragging ? "z-40 opacity-90 shadow-xl ring-2 ring-accent" : ""}`}
        style={{ left: place.start * pps, width: Math.max(8, place.duration * pps), translate: dragging ? `${drag?.dx ?? 0}px 0` : undefined }}
      >
        <button
          type="button"
          tabIndex={quiet && !selected ? -1 : undefined}
          aria-label={`${selected ? "Selected" : "Select"} ${item.label}, ${formatPhoneTime(item.start)} to ${formatPhoneTime(item.start + item.duration)}`}
          onClick={(e) => {
            e.stopPropagation();
            if (justDragged.current) return;
            if (item.kind) select({ type: item.kind, id: item.id });
            else selectClip(item.id);
          }}
          className={`absolute inset-0 truncate px-2 text-left text-[11px] font-medium text-white ${tone} ${
            selected ? "rounded-none border-y-2 border-white" : "rounded-md"
          }`}
        >
          {selected ? `${place.duration.toFixed(1)}s · ${item.label}` : item.label}
        </button>
        {item.clip && (
          <span className={`pointer-events-none absolute inset-0 overflow-hidden ${selected ? "" : "rounded-md"}`}>
            <AnimationBands clip={item.clip} pps={pps} offset={place.startDelta} />
          </span>
        )}
        {target && (
          <>
            <TrimHandle side="start" value={place.start} onPointerDown={beginTrim(target, "start")} />
            <TrimHandle side="end" value={place.start + place.duration} onPointerDown={beginTrim(target, "end")} />
          </>
        )}
      </div>
    );
  };

  /** Select the block after (or before) the selected one, or the playhead when none is selected. */
  const stepper = (items: LaneItem[], noun: string) => {
    const sorted = [...items].sort((a, b) => a.start - b.start);
    const step = (direction: 1 | -1) => {
      const at = sorted.findIndex((item) => selectedIds.has(item.id));
      const playhead = useTimelineStore.getState().playheadPosition;
      const next =
        at >= 0
          ? sorted[at + direction]
          : direction === 1
            ? sorted.find((item) => item.start >= playhead - 1e-6)
            : [...sorted].reverse().find((item) => item.start < playhead - 1e-6);
      if (!next) return;
      if (next.kind) select({ type: next.kind, id: next.id });
      else select({ type: "clip", id: next.id, trackId: next.clip?.trackId });
      useTimelineStore.getState().seekTo(next.start);
    };
    return (
      <div className="sr-only">
        <button type="button" onClick={(e) => { e.stopPropagation(); step(-1); }}>{`Previous ${noun}`}</button>
        <button type="button" onClick={(e) => { e.stopPropagation(); step(1); }}>{`Next ${noun}`}</button>
      </div>
    );
  };

  const addLane = (label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      // The whole lane is the tap target; the pill inside is just how it looks.
      className="absolute inset-y-0 left-0 flex py-1 text-[13px] text-fg-2"
      style={{ width: Math.max(contentWidth, width * 0.6) }}
    >
      <span className="flex flex-1 items-center gap-2 rounded-md bg-bg-2 px-3">
        <Plus size={16} aria-hidden />
        {label}
      </span>
    </button>
  );

  return (
    <div className="phone-timeline relative flex h-full min-h-0 flex-col bg-bg">
      <div
        ref={scrollRef}
        data-testid="phone-timeline-scroll"
        onScroll={handleScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onClick={() => clearSelection()}
        role="region"
        aria-label="Timeline"
        className="scrollbar-none relative min-h-0 flex-1 overflow-x-auto overflow-y-auto"
        style={{ touchAction: "pan-x pan-y" }}
      >
        <div className="relative" style={{ width: contentWidth + width, minHeight: "100%" }}>
          {/* Ruler */}
          <div className="sticky top-0 z-10 h-7 bg-bg">
            {ticks.map((t) => {
              const isLabel = Math.abs(t / step - Math.round(t / step)) < 1e-6;
              return isLabel ? (
                <span
                  key={t}
                  className="absolute top-1.5 -translate-x-1/2 font-mono text-[11px] text-fg-3"
                  style={{ left: half + t * pps }}
                >
                  {formatPhoneTime(t)}
                </span>
              ) : (
                <span
                  key={t}
                  aria-hidden
                  className="absolute top-3 h-1 w-1 -translate-x-1/2 rounded-full bg-fg-muted"
                  style={{ left: half + t * pps }}
                />
              );
            })}
            {(project.timeline.markers ?? []).map((marker) => (
              <button
                key={marker.id}
                type="button"
                aria-label={`${marker.label}, ${formatPhoneTime(marker.time)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  const timeline = useTimelineStore.getState();
                  timeline.pause();
                  timeline.seekTo(marker.time);
                }}
                className="absolute top-0 grid h-7 w-6 -translate-x-1/2 place-items-start justify-center"
                style={{ left: half + marker.time * pps }}
              >
                <span className="h-3 w-2.5 [clip-path:polygon(0_0,100%_0,100%_70%,50%_100%,0_70%)]" style={{ background: marker.color ?? "#3b82f6" }} />
              </button>
            ))}
          </div>

          <div className="relative space-y-2 pt-3 pb-6" style={{ paddingLeft: half }}>
            {snapLine !== null && (
              <div
                aria-hidden
                data-testid="timeline-snap-line"
                className="pointer-events-none absolute inset-y-0 z-50 w-px bg-[var(--accent)]"
                style={{ left: half + snapLine * pps }}
              />
            )}
            {/* Main track: mute switch before 00:00, then the clip filmstrip */}
            <div role="group" aria-label="Video" className="relative" style={{ height: MAIN_LANE_H }}>
              {lanes.mainTrack && (
                <button
                  type="button"
                  aria-label={mainMuted ? "Unmute clip audio" : "Mute clip audio"}
                  aria-pressed={mainMuted}
                  onClick={(e) => {
                    e.stopPropagation();
                    void muteTrack(lanes.mainTrack!.id, !mainMuted);
                  }}
                  className="absolute top-1/2 flex w-12 -translate-y-1/2 flex-col items-center gap-0.5 text-fg-2"
                  style={{ left: -136 }}
                >
                  {mainMuted ? <VolumeX size={20} aria-hidden /> : <Volume2 size={20} aria-hidden />}
                  <span className="text-[10px] leading-tight">{mainMuted ? "Unmute" : "Mute clip"}</span>
                </button>
              )}
              {lanes.main.length > 0 && (
                <button
                  type="button"
                  aria-label="Set cover"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCoverOpen(true);
                  }}
                  className="absolute top-1/2 flex h-[52px] w-[52px] -translate-y-1/2 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg bg-bg-3 bg-cover bg-center text-white"
                  style={{ left: -76, backgroundImage: coverImage ? `url("${coverImage}")` : undefined }}
                >
                  <span aria-hidden className="absolute inset-0 bg-black/45" />
                  <Pencil size={14} className="relative" aria-hidden />
                  <span className="relative text-[10px] font-medium">Cover</span>
                </button>
              )}
              {lanes.main.length === 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddMedia();
                  }}
                  className="absolute inset-y-0 left-0 flex w-40 items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong text-[13px] text-fg-2"
                >
                  <Plus size={16} aria-hidden />
                  Add media
                </button>
              )}
              {lanes.main.map((clip) => {
                const selected = selectedIds.has(clip.id);
                const place = drafted(clip.id, finite(clip.startTime), finite(clip.duration));
                // Clips after one whose end is being dragged follow it, as they will once it is saved.
                const trimmed = trim?.side === "end" ? lanes.main.find((c) => c.id === trim.id) : undefined;
                const follow = trim && trimmed && clip.startTime > trimmed.startTime ? trim.delta : 0;
                const left = (place.start + follow) * pps;
                const clipDuration = place.duration;
                const clipWidth = Math.max(4, clipDuration * pps);
                const media = mediaById.get(clip.mediaId);
                const inPoint = media?.type === "image" ? 0 : clip.inPoint + place.startDelta;
                const target = selected ? trimTarget({ id: clip.id, start: clip.startTime, duration: clip.duration, clip, main: true }) : null;
                const tiles = Math.max(1, Math.ceil(clipWidth / MAIN_LANE_H));
                return (
                  <div
                    key={clip.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${selected ? "Selected" : "Select"} ${media?.name ?? "clip"}`}
                    onPointerDown={startPress(clip)}
                    onContextMenu={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!justDragged.current) selectClip(clip.id, clip.trackId);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") selectClip(clip.id, clip.trackId);
                    }}
                    className={`absolute inset-y-0 select-none overflow-visible ${selected ? "z-20" : ""} ${
                      drag?.id === clip.id ? "z-40 scale-105 opacity-90 shadow-xl ring-2 ring-accent transition-transform" : ""
                    }`}
                    style={{ left, width: clipWidth, translate: drag?.id === clip.id ? `${drag.dx}px 0` : undefined }}
                  >
                    <div className={`relative flex h-full overflow-hidden bg-bg-3 ${selected ? "rounded-none" : "rounded-md"}`}>
                      {Array.from({ length: tiles }, (_, i) => {
                        const url = thumbnailAt(media, inPoint + ((i + 0.5) * MAIN_LANE_H) / pps);
                        return (
                          <div
                            key={i}
                            className="h-full shrink-0 bg-cover bg-center"
                            style={{ width: MAIN_LANE_H, backgroundImage: url ? `url("${url}")` : undefined }}
                          />
                        );
                      })}
                      <AnimationBands clip={clip} pps={pps} offset={place.startDelta} />
                    </div>
                    {selected && (
                      <>
                        <div className="pointer-events-none absolute inset-0 border-y-2 border-white" />
                        <span className="pointer-events-none absolute left-2 top-1 rounded bg-black/60 px-1 text-[11px] font-medium text-white">
                          {clipDuration.toFixed(1)}s
                        </span>
                        {target && (
                          <>
                            <TrimHandle side="start" value={inPoint} onPointerDown={beginTrim(target, "start")} />
                            <TrimHandle side="end" value={inPoint + clipDuration} onPointerDown={beginTrim(target, "end")} />
                          </>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {lanes.overlay.length > 0 && (
              <div role="group" aria-label={`Overlays, ${lanes.overlay.length}`} className="relative" style={{ height: LANE_H }}>
                {lanes.overlay.map((item) => renderBar(item, "bg-[#5b4bb7]"))}
              </div>
            )}

            <div role="group" aria-label={`Audio, ${lanes.audio.length}`} className="relative" style={{ height: LANE_H }}>
              {lanes.audio.length > MANY_BLOCKS && stepper(lanes.audio, "audio clip")}
              <Music aria-hidden size={16} className="absolute top-1/2 -translate-y-1/2 text-fg-3" style={{ left: -34 }} />
              {lanes.audio.length > 0
                ? lanes.audio.map((item) => renderBar(item, "bg-[#1f7a5a]", lanes.audio.length > MANY_BLOCKS))
                : addLane("Add audio", onAddAudio)}
            </div>

            <div role="group" aria-label={`Text and captions, ${lanes.text.length}`} className="relative" style={{ height: LANE_H }}>
              {lanes.text.length > MANY_BLOCKS && stepper(lanes.text, "caption")}
              <Type aria-hidden size={16} className="absolute top-1/2 -translate-y-1/2 text-fg-3" style={{ left: -34 }} />
              {lanes.text.length > 0
                ? lanes.text.map((item) => renderBar(item, "bg-[#e8890c]", lanes.text.length > MANY_BLOCKS))
                : addLane("Add text", onAddText)}
            </div>
          </div>
        </div>
      </div>

      {/* Current time, pinned over the start of the ruler */}
      <div className="pointer-events-none absolute left-0 top-0 z-20 flex h-7 items-center bg-bg pl-3 pr-2 font-mono text-[12px] text-fg-3">
        <PhoneCurrentTime />&nbsp;/ {formatPhoneTime(duration)}
      </div>

      {/* Fixed centre playhead */}
      <div aria-hidden className="pointer-events-none absolute bottom-0 left-1/2 top-7 z-30 w-0.5 -translate-x-1/2 rounded bg-fg" />

      {/* Add media, pinned to the right like CapCut */}
      <button
        type="button"
        aria-label="Add media"
        onClick={onAddMedia}
        className="absolute right-3 z-30 grid h-11 w-11 place-items-center rounded-lg bg-white text-black shadow-md"
        style={{ top: 28 + 12 + (MAIN_LANE_H - 44) / 2 }}
      >
        <Plus size={24} aria-hidden />
      </button>
      {coverOpen && (
        <PhoneCoverScreen
          duration={duration}
          aspect={(project.settings.width || 16) / (project.settings.height || 9)}
          thumbAt={mainThumbAt}
          onSave={saveCover}
          onClose={() => setCoverOpen(false)}
        />
      )}
    </div>
  );
}
