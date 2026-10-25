import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Plus, Volume2, VolumeX } from "@/icons/lucide-compat";
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

type LaneItem = { id: string; start: number; duration: number; label: string };
type TrimDraft = { id: string; side: "start" | "end"; delta: number };

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
  const moveClip = useProjectStore((s) => s.moveClip);
  const muteTrack = useProjectStore((s) => s.muteTrack);
  const playheadPosition = useTimelineStore((s) => s.playheadPosition);
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

  const half = width / 2;
  // A reopened project can report 0 until its next edit, so also measure the clips.
  const duration = Math.max(
    project.timeline.duration ?? 0,
    ...project.timeline.tracks.flatMap((t) => t.clips.map((c) => c.startTime + c.duration)),
    0,
  );
  const selectedIds = useMemo(
    () => new Set(selectedItems.filter((i) => i.type === "clip").map((i) => i.id)),
    [selectedItems],
  );
  const mediaById = useMemo(
    () => new Map(project.mediaLibrary.items.map((m) => [m.id, m] as const)),
    [project.mediaLibrary.items],
  );

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
          start: clip.startTime,
          duration: clip.duration,
          label: mediaById.get(clip.mediaId)?.name ?? "Clip",
        };
        if (kindOf(clip) === "audio") audio.push(item);
        else if (track !== mainTrack) overlay.push(item);
      }
    }
    const text: LaneItem[] = [
      ...(project.textClips ?? []).map((c) => ({ id: c.id, start: c.startTime, duration: c.duration, label: c.text || "Text" })),
      ...(project.shapeClips ?? []).map((c) => ({ id: c.id, start: c.startTime, duration: c.duration, label: "Shape" })),
      ...(project.svgClips ?? []).map((c) => ({ id: c.id, start: c.startTime, duration: c.duration, label: "Graphic" })),
      ...(project.stickerClips ?? []).map((c) => ({ id: c.id, start: c.startTime, duration: c.duration, label: "Sticker" })),
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

  // Follow the playhead unless the user is swiping the timeline.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || userScrollingRef.current) return;
    el.scrollLeft = playheadPosition * pps;
  }, [playheadPosition, pps, width]);

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

  const beginTrim = (clip: Clip, side: TrimDraft["side"]) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const mediaDuration = mediaById.get(clip.mediaId)?.metadata?.duration;
    const maxOut = mediaDuration && mediaDuration > 0 ? mediaDuration : Infinity;
    const clampDelta = (raw: number) =>
      side === "start"
        ? Math.min(clip.outPoint - clip.inPoint - MIN_TRIM, Math.max(-clip.inPoint, raw))
        : Math.min(maxOut - clip.outPoint, Math.max(-(clip.outPoint - clip.inPoint - MIN_TRIM), raw));
    const move = (ev: PointerEvent) => setTrim({ id: clip.id, side, delta: clampDelta((ev.clientX - startX) / pps) });
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const delta = clampDelta((ev.clientX - startX) / pps);
      setTrim(null);
      if (Math.abs(delta) < 1 / 60) return;
      void (async () => {
        if (side === "start") {
          await trimClip(clip.id, clip.inPoint + delta, undefined);
          await moveClip(clip.id, clip.startTime + delta);
        } else {
          await trimClip(clip.id, undefined, clip.outPoint + delta);
        }
      })();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const step = labelStep(pps);
  const rulerEnd = Math.max(duration, (width / pps) * 0.6);
  const ticks: number[] = [];
  for (let t = 0; t <= rulerEnd + step; t += step / 2) ticks.push(Math.round(t * 1000) / 1000);

  const mainMuted = lanes.mainTrack?.muted ?? false;
  const contentWidth = Math.max(duration, 0.1) * pps;

  const renderBar = (item: LaneItem, tone: string) => {
    const selected = selectedIds.has(item.id);
    return (
      <button
        key={item.id}
        type="button"
        aria-label={`Select ${item.label}`}
        aria-pressed={selected}
        onClick={(e) => {
          e.stopPropagation();
          selectClip(item.id);
        }}
        className={`absolute top-1 bottom-1 truncate rounded-md px-2 text-left text-[11px] font-medium text-white ${tone} ${
          selected ? "ring-2 ring-white" : ""
        }`}
        style={{ left: item.start * pps, width: Math.max(8, item.duration * pps) }}
      >
        {item.label}
      </button>
    );
  };

  const addLane = (label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="absolute inset-y-1 left-0 flex items-center gap-2 rounded-md bg-bg-2 px-3 text-[13px] text-fg-2"
      style={{ width: Math.max(contentWidth, width * 0.6) }}
    >
      <Plus size={16} aria-hidden />
      {label}
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
          </div>

          <div className="relative space-y-2 pt-3 pb-6" style={{ paddingLeft: half }}>
            {/* Main track: mute switch before 00:00, then the clip filmstrip */}
            <div className="relative" style={{ height: MAIN_LANE_H }}>
              {lanes.mainTrack && (
                <button
                  type="button"
                  aria-label={mainMuted ? "Unmute clip audio" : "Mute clip audio"}
                  aria-pressed={mainMuted}
                  onClick={(e) => {
                    e.stopPropagation();
                    void muteTrack(lanes.mainTrack!.id, !mainMuted);
                  }}
                  className="absolute top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-xl bg-bg-2 text-fg-2"
                  style={{ left: -64 }}
                >
                  {mainMuted ? <VolumeX size={20} aria-hidden /> : <Volume2 size={20} aria-hidden />}
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
                const draft = trim?.id === clip.id ? trim : null;
                const left = (clip.startTime + (draft?.side === "start" ? draft.delta : 0)) * pps;
                const clipDuration =
                  clip.duration - (draft?.side === "start" ? draft.delta : 0) + (draft?.side === "end" ? draft.delta : 0);
                const clipWidth = Math.max(4, clipDuration * pps);
                const media = mediaById.get(clip.mediaId);
                const inPoint = clip.inPoint + (draft?.side === "start" ? draft.delta : 0);
                const tiles = Math.max(1, Math.ceil(clipWidth / MAIN_LANE_H));
                return (
                  <div
                    key={clip.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Select ${media?.name ?? "clip"}`}
                    aria-pressed={selected}
                    onClick={(e) => {
                      e.stopPropagation();
                      selectClip(clip.id, clip.trackId);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") selectClip(clip.id, clip.trackId);
                    }}
                    className={`absolute inset-y-0 overflow-visible ${selected ? "z-20" : ""}`}
                    style={{ left, width: clipWidth }}
                  >
                    <div className={`flex h-full overflow-hidden bg-bg-3 ${selected ? "rounded-none" : "rounded-md"}`}>
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
                    </div>
                    {selected && (
                      <>
                        <div className="pointer-events-none absolute inset-0 border-y-2 border-white" />
                        <span className="pointer-events-none absolute left-2 top-1 rounded bg-black/60 px-1 text-[11px] font-medium text-white">
                          {clipDuration.toFixed(1)}s
                        </span>
                        <span
                          role="slider"
                          aria-label="Trim start"
                          aria-valuenow={Math.round(inPoint * 10) / 10}
                          onPointerDown={beginTrim(clip, "start")}
                          onClick={(e) => e.stopPropagation()}
                          className="absolute inset-y-0 -left-4 grid w-4 touch-none place-items-center rounded-l-md bg-white"
                        >
                          <span className="h-4 w-0.5 rounded bg-black/50" />
                        </span>
                        <span
                          role="slider"
                          aria-label="Trim end"
                          aria-valuenow={Math.round((inPoint + clipDuration) * 10) / 10}
                          onPointerDown={beginTrim(clip, "end")}
                          onClick={(e) => e.stopPropagation()}
                          className="absolute inset-y-0 -right-4 grid w-4 touch-none place-items-center rounded-r-md bg-white"
                        >
                          <span className="h-4 w-0.5 rounded bg-black/50" />
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {lanes.overlay.length > 0 && (
              <div className="relative" style={{ height: LANE_H }}>
                {lanes.overlay.map((item) => renderBar(item, "bg-[#5b4bb7]"))}
              </div>
            )}

            <div className="relative" style={{ height: LANE_H }}>
              {lanes.audio.length > 0
                ? lanes.audio.map((item) => renderBar(item, "bg-[#1f7a5a]"))
                : addLane("Add audio", onAddAudio)}
            </div>

            <div className="relative" style={{ height: LANE_H }}>
              {lanes.text.length > 0
                ? lanes.text.map((item) => renderBar(item, "bg-[#b06a1e]"))
                : addLane("Add text", onAddText)}
            </div>
          </div>
        </div>
      </div>

      {/* Current time, pinned over the start of the ruler */}
      <div className="pointer-events-none absolute left-0 top-0 z-20 flex h-7 items-center bg-bg pl-3 pr-2 font-mono text-[12px] text-fg-3">
        <span className="text-fg">{formatPhoneTime(playheadPosition)}</span>&nbsp;/ {formatPhoneTime(duration)}
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
    </div>
  );
}
