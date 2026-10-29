import React, { useEffect, useMemo, useRef, useState } from "react";
import { FILTER_CATEGORIES, FILTER_PRESETS, getMediaItemCapabilities, getSpeedEngine, type Clip, type FilterPreset, type Keyframe } from "@openreel/core";
import {
  Aperture,
  Ban,
  Check,
  CircleDot,
  Contrast,
  Droplet,
  Droplets,
  Moon,
  Palette,
  RotateCcw,
  Sun,
  SunDim,
  Thermometer,
  Triangle,
  Waves,
  type LucideIcon,
} from "@/icons/lucide-compat";
import { useProjectStore } from "../../stores/project-store";
import { useTimelineStore } from "../../stores/timeline-store";
import type { VideoEffect, VideoEffectType } from "../../bridges/effects-bridge";
import { getPresetLibrary, type MotionPreset, type PresetCategory } from "../../services/motion-presets";
import { buildPreviewCSSKeyframes, generateKeyframesFromPreset } from "./inspector/MotionPresetsPanel";
import { applyTransform, currentTransform, findSelectedVisual, type FlatTransform } from "./phone-keyframes";
import { capturePreviewStill } from "./PhoneExportScreen";
import { useSheet } from "../../hooks/useSheet";

export type ClipPanel = "speed" | "volume" | "opacity" | "basic" | "adjust" | "filters" | "animations" | "effects";

/* ------------------------------------------------------------------ */
/* Shared parts                                                        */
/* ------------------------------------------------------------------ */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function useClip(clipId: string): Clip | undefined {
  return useProjectStore((s) => {
    for (const track of s.project.timeline.tracks) {
      const clip = track.clips.find((c) => c.id === clipId);
      if (clip) return clip;
    }
    return undefined;
  });
}

/** The clip's effects, refreshed whenever the project changes. */
function useVideoEffects(clipId: string): VideoEffect[] {
  useProjectStore((s) => s.project);
  return useProjectStore.getState().getVideoEffects(clipId);
}

/** Calls `fn` at most once per frame with the latest arguments. */
function useFrameThrottle<A extends unknown[]>(fn: (...args: A) => void) {
  const latest = useRef(fn);
  latest.current = fn;
  const frame = useRef(0);
  const args = useRef<A | null>(null);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  return useMemo(
    () => ({
      call: (...next: A) => {
        args.current = next;
        if (frame.current) return;
        frame.current = requestAnimationFrame(() => {
          frame.current = 0;
          if (args.current) latest.current(...args.current);
        });
      },
      flush: () => {
        cancelAnimationFrame(frame.current);
        frame.current = 0;
        if (args.current) latest.current(...args.current);
        args.current = null;
      },
    }),
    [],
  );
}

/** The bottom sheet every clip tool opens: a tab row or a title, and a tick. */
function PanelFrame({
  title,
  tabs,
  tab,
  onTab,
  onReset,
  onDone,
  fill,
  children,
}: {
  title?: string;
  tabs?: { id: string; label: string }[];
  tab?: string;
  onTab?: (id: string) => void;
  onReset?: () => void;
  onDone: () => void;
  /** Grid panels cover the timeline; slider panels sit at the bottom. */
  fill?: boolean;
  children: React.ReactNode;
}) {
  const { ref, handle, close } = useSheet(onDone);
  return (
    <section
      ref={ref}
      role="dialog"
      aria-label={title ?? tabs?.find((t) => t.id === tab)?.label}
      className={`phone-sheet-in absolute inset-x-0 bottom-0 z-[100] flex flex-col bg-bg-1 ${fill ? "top-0" : ""}`}
    >
      {tabs && (
        <header {...handle} className="flex h-12 shrink-0 items-center border-b border-border/60 pl-2">
          <div role="tablist" className="scrollbar-none flex min-w-0 flex-1 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={t.id === tab}
                onClick={() => onTab?.(t.id)}
                className={`relative shrink-0 px-3 py-3 text-[15px] ${t.id === tab ? "font-semibold text-fg" : "text-fg-3"}`}
              >
                {t.label}
                {t.id === tab && <span className="absolute inset-x-3 bottom-1 h-[2px] rounded-full bg-fg" />}
              </button>
            ))}
          </div>
          <button type="button" aria-label="Done" onClick={close} className="grid h-12 w-12 shrink-0 place-items-center text-fg active:opacity-50">
            <Check size={24} aria-hidden />
          </button>
        </header>
      )}
      {tabs && (
        // A grab bar under the tabs to pull the panel down by.
        <div {...handle} aria-hidden className="flex h-4 shrink-0 items-center justify-center">
          <span className="h-1 w-9 rounded-full bg-fg-3 opacity-60" />
        </div>
      )}
      <div className={`min-h-0 ${fill ? "flex-1 overflow-y-auto" : ""}`}>{children}</div>
      {!tabs && (
        <footer {...handle} className="relative flex h-12 shrink-0 items-center border-t border-border/60 px-2">
          {onReset && (
            <button type="button" onClick={onReset} className="flex items-center gap-1.5 px-2 py-2 text-[13px] text-fg-2">
              <RotateCcw size={15} aria-hidden />
              Reset
            </button>
          )}
          <span className="pointer-events-none absolute inset-x-0 text-center text-[15px] font-semibold">{title}</span>
          <button type="button" aria-label="Done" onClick={close} className="ml-auto grid h-11 w-11 place-items-center text-fg active:opacity-50">
            <Check size={24} aria-hidden />
          </button>
        </footer>
      )}
    </section>
  );
}

/**
 * CapCut's slider: a thin track with a white knob and the value floating
 * above it. `onChange` fires while dragging, `onCommit` on release.
 */
export function CapSlider({
  value,
  min,
  max,
  onChange,
  onCommit,
  format = (v) => String(Math.round(v)),
  marks,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  format?: (v: number) => string;
  /** Labels under the track at fractions 0..1, like the speed anchors. */
  marks?: { at: number; label: string }[];
  label: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const last = useRef(value);
  const t = max === min ? 0 : clamp((value - min) / (max - min), 0, 1);
  // Bipolar sliders fill from the middle, like CapCut's Adjust.
  const origin = min < 0 && max > 0 ? -min / (max - min) : 0;
  const at = (clientX: number) => {
    const box = track.current?.getBoundingClientRect();
    if (!box || box.width === 0) return value;
    return min + clamp((clientX - box.left) / box.width, 0, 1) * (max - min);
  };
  return (
    <div className="px-7 pb-2 pt-9">
      <div
        ref={track}
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={format(value)}
        tabIndex={0}
        className="relative h-8 touch-none select-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          last.current = at(e.clientX);
          onChange(last.current);
        }}
        onPointerMove={(e) => {
          if (!dragging) return;
          last.current = at(e.clientX);
          onChange(last.current);
        }}
        onPointerUp={() => {
          setDragging(false);
          onCommit?.(last.current);
        }}
        onPointerCancel={() => setDragging(false)}
        onKeyDown={(e) => {
          const step = (max - min) / 100;
          const next = e.key === "ArrowRight" ? value + step : e.key === "ArrowLeft" ? value - step : null;
          if (next === null) return;
          e.preventDefault();
          const v = clamp(next, min, max);
          onChange(v);
          onCommit?.(v);
        }}
      >
        <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white/20" />
        <span
          className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white"
          style={{ left: `${Math.min(origin, t) * 100}%`, width: `${Math.abs(t - origin) * 100}%` }}
        />
        <span
          className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow"
          style={{ left: `${t * 100}%` }}
        />
        <span
          className="absolute -top-8 -translate-x-1/2 whitespace-nowrap text-[13px] font-semibold tabular-nums"
          style={{ left: `${t * 100}%` }}
        >
          {format(value)}
        </span>
      </div>
      {marks && (
        <div className="relative mt-1 h-4 text-[11px] text-fg-3">
          {marks.map((m) => (
            <span key={m.label} className="absolute -translate-x-1/2" style={{ left: `${m.at * 100}%` }}>
              {m.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * CapCut's ruler dial for Position, Rotate and Zoom: drag the ruler under a
 * fixed teal marker; the value reads out above.
 */
export function TickDial({
  value,
  min,
  max,
  unitsPerTick,
  onChange,
  onCommit,
  format,
  label,
}: {
  value: number;
  min: number;
  max: number;
  /** How much one tick (8px) is worth. */
  unitsPerTick: number;
  onChange: (v: number) => void;
  onCommit?: () => void;
  format: (v: number) => string;
  label: string;
}) {
  const TICK = 8;
  const drag = useRef<{ x: number; start: number } | null>(null);
  const offset = ((value - min) / unitsPerTick) * TICK;
  const ticks = Math.round((max - min) / unitsPerTick);
  return (
    <div className="py-2">
      <div className="mb-1 flex items-baseline justify-center gap-2 text-[13px]">
        <span className="text-fg-3">{label}</span>
        <span className="font-semibold tabular-nums">{format(value)}</span>
      </div>
      <div
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={format(value)}
        tabIndex={0}
        className="relative h-9 touch-none select-none overflow-hidden"
        style={{ maskImage: "linear-gradient(90deg, transparent, #000 25%, #000 75%, transparent)" }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, start: value };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const units = ((drag.current.x - e.clientX) / TICK) * unitsPerTick;
          onChange(clamp(drag.current.start + units, min, max));
        }}
        onPointerUp={() => {
          drag.current = null;
          onCommit?.();
        }}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={(e) => {
          const next = e.key === "ArrowRight" ? value + unitsPerTick : e.key === "ArrowLeft" ? value - unitsPerTick : null;
          if (next === null) return;
          e.preventDefault();
          onChange(clamp(next, min, max));
          onCommit?.();
        }}
      >
        <div className="absolute inset-y-0 left-1/2" style={{ transform: `translateX(${-offset}px)` }}>
          {Array.from({ length: ticks + 1 }, (_, i) => (
            <span
              key={i}
              className={`absolute bottom-1 w-px bg-white/45 ${i % 5 === 0 ? "h-5" : "h-3"}`}
              style={{ left: i * TICK }}
            />
          ))}
        </div>
        <span className="absolute bottom-0 left-1/2 h-8 w-[3px] -translate-x-1/2 rounded-full bg-[var(--accent)]" />
      </div>
    </div>
  );
}

/** A round icon button with a label under it, like CapCut's Adjust items. */
function RoundItem({ icon: Icon, label, active, changed, onClick }: { icon: LucideIcon; label: string; active: boolean; changed?: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className="flex w-[64px] shrink-0 flex-col items-center gap-1.5">
      <span
        className={`relative grid h-12 w-12 place-items-center rounded-full ${active ? "bg-white text-black" : "bg-white/10 text-fg"}`}
      >
        <Icon size={20} strokeWidth={1.6} aria-hidden />
        {changed && !active && <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-[var(--accent)]" />}
      </span>
      <span className={`text-[11px] ${active ? "text-fg" : "text-fg-3"}`}>{label}</span>
    </button>
  );
}

/** A picture tile with its name under it; the still is styled to hint at the look. */
function Tile({ label, still, style, active, onClick, children, autoplay }: { label: string; still?: string; style?: React.CSSProperties; active: boolean; onClick: () => void; children?: React.ReactNode; autoplay?: boolean }) {
  const img = useRef<HTMLImageElement>(null);
  const look = style?.filter;
  // Effect tiles play their look on a loop: the plain frame, then the effect.
  useEffect(() => {
    if (!autoplay || !look || !img.current?.animate) return;
    const anim = img.current.animate([{ filter: "none" }, { filter: look }, { filter: look }, { filter: "none" }], {
      duration: 2400,
      iterations: Infinity,
      easing: "ease-in-out",
    });
    return () => anim.cancel();
  }, [autoplay, look]);
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className="flex min-w-0 flex-col items-center gap-1">
      <span
        className={`relative grid aspect-square w-full place-items-center overflow-hidden rounded-lg bg-white/10 ${active ? "ring-2 ring-[var(--accent)]" : ""}`}
      >
        {still && <img ref={img} src={still} alt="" className="h-full w-full object-cover" style={style} />}
        {children}
      </span>
      <span className={`w-full truncate text-center text-[11px] ${active ? "text-fg" : "text-fg-3"}`}>{label}</span>
    </button>
  );
}

function NoneTile({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <Tile label="None" active={active} onClick={onClick}>
      <Ban size={24} className="text-fg-3" aria-hidden />
    </Tile>
  );
}

/* ------------------------------------------------------------------ */
/* Tagged effects: filters, adjustments and effects keep to themselves */
/* ------------------------------------------------------------------ */

type EffectTag = "filter" | "adjust" | "effect";

const tagOf = (effect: VideoEffect) => effect.params.phone as EffectTag | undefined;

// Effect edits are async; run them one after another so a quick drag can't
// add the same effect twice.
let effectQueue: Promise<unknown> = Promise.resolve();
const queue = (job: () => Promise<unknown>) => (effectQueue = effectQueue.then(job, job));

function taggedEffects(clipId: string, tag: EffectTag, key?: string) {
  return useProjectStore
    .getState()
    .getVideoEffects(clipId)
    .filter((e) => tagOf(e) === tag && (key === undefined || e.params.key === key));
}

/** Set (or with `params` null, remove) the one tagged effect for `key`. */
function setTaggedEffect(clipId: string, tag: EffectTag, key: string, type: VideoEffectType, params: Record<string, unknown> | null) {
  return queue(async () => {
    const store = useProjectStore.getState();
    const [existing, ...extra] = taggedEffects(clipId, tag, key);
    for (const e of extra) await store.removeVideoEffect(clipId, e.id);
    if (!params) {
      if (existing) await store.removeVideoEffect(clipId, existing.id);
      return;
    }
    const full = { ...params, phone: tag, key };
    if (existing && existing.type === type) await store.updateVideoEffect(clipId, existing.id, full);
    else {
      if (existing) await store.removeVideoEffect(clipId, existing.id);
      await store.addVideoEffect(clipId, type, full);
    }
  });
}

function clearTagged(clipId: string, tag: EffectTag) {
  return queue(async () => {
    const store = useProjectStore.getState();
    for (const e of taggedEffects(clipId, tag)) await store.removeVideoEffect(clipId, e.id);
  });
}

/** Every video and photo clip in the project. */
function pictureClips(): Clip[] {
  const { project } = useProjectStore.getState();
  return project.timeline.tracks.flatMap((t) =>
    t.clips.filter((c) => project.mediaLibrary.items.find((m) => m.id === c.mediaId)?.type !== "audio"),
  );
}

/* ------------------------------------------------------------------ */
/* Speed                                                               */
/* ------------------------------------------------------------------ */

const SPEED_ANCHORS = [0.1, 1, 2, 5, 10, 100];
const speedToT = (speed: number) => {
  const i = SPEED_ANCHORS.findIndex((a, k) => k > 0 && speed <= a);
  const k = i < 0 ? SPEED_ANCHORS.length - 1 : i;
  const [a, b] = [SPEED_ANCHORS[k - 1], SPEED_ANCHORS[k]];
  return (k - 1 + clamp((speed - a) / (b - a), 0, 1)) / (SPEED_ANCHORS.length - 1);
};
const tToSpeed = (t: number) => {
  const pos = clamp(t, 0, 1) * (SPEED_ANCHORS.length - 1);
  const k = Math.min(SPEED_ANCHORS.length - 2, Math.floor(pos));
  const raw = SPEED_ANCHORS[k] + (SPEED_ANCHORS[k + 1] - SPEED_ANCHORS[k]) * (pos - k);
  return raw < 10 ? Math.round(raw * 10) / 10 : Math.round(raw);
};
const seconds = (s: number) => `${s.toFixed(1)}s`;

function SpeedPanel({ clipId, onDone }: { clipId: string; onDone: () => void }) {
  const clip = useClip(clipId);
  const current = clip?.speed ?? 1;
  const [speed, setSpeed] = useState(current);
  useEffect(() => setSpeed(current), [current]);
  if (!clip) return null;
  const original = clip.duration * current;

  const commit = (next: number) => {
    const store = useProjectStore.getState();
    const engine = getSpeedEngine();
    const { project } = store;
    // A video's sound sits on its own audio clip from the same file; it follows the picture.
    const linked = project.timeline.tracks
      .flatMap((t) => t.clips)
      .find(
        (c) =>
          c.id !== clip.id &&
          c.mediaId === clip.mediaId &&
          getMediaItemCapabilities(project.mediaLibrary.items.find((m) => m.id === c.mediaId)).audio,
      );
    for (const target of linked ? [clip, linked] : [clip]) {
      engine.setClipSpeed(target.id, next, target.duration);
      void store.executeAction({ type: "clip/setSpeed", id: crypto.randomUUID(), timestamp: Date.now(), params: { clipId: target.id, speed: next } });
    }
  };

  return (
    <PanelFrame title="Speed" onDone={onDone} onReset={() => { setSpeed(1); commit(1); }}>
      <p className="px-5 pt-3 text-[13px] text-fg-3">
        Duration: {seconds(original)} → <span className="text-fg">{seconds(original / speed)}</span>
      </p>
      <CapSlider
        label="Speed"
        value={speedToT(speed)}
        min={0}
        max={1}
        format={() => `${speed}x`}
        marks={SPEED_ANCHORS.map((a, i) => ({ at: i / (SPEED_ANCHORS.length - 1), label: `${a}x` }))}
        onChange={(t) => setSpeed(tToSpeed(t))}
        onCommit={(t) => commit(tToSpeed(t))}
      />
    </PanelFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Volume and Opacity                                                  */
/* ------------------------------------------------------------------ */

function VolumePanel({ clipId, onDone }: { clipId: string; onDone: () => void }) {
  const clip = useClip(clipId);
  const stored = Math.round((clip?.volume ?? 1) * 100);
  const [volume, setVolume] = useState(stored);
  useEffect(() => setVolume(stored), [stored]);
  const commit = (v: number) =>
    void useProjectStore.getState().executeAction({
      type: "audio/setVolume",
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      params: { clipId, volume: Math.round(v) / 100 },
    });
  return (
    <PanelFrame title="Volume" onDone={onDone} onReset={() => { setVolume(100); commit(100); }}>
      <CapSlider label="Volume" value={volume} min={0} max={400} format={(v) => `${Math.round(v)}`} onChange={setVolume} onCommit={commit} />
    </PanelFrame>
  );
}

function OpacityPanel({ clipId, onDone }: { clipId: string; onDone: () => void }) {
  const clip = useClip(clipId);
  const stored = Math.round((clip?.transform.opacity ?? 1) * 100);
  const [opacity, setOpacity] = useState(stored);
  useEffect(() => setOpacity(stored), [stored]);
  const write = useFrameThrottle((v: number) => void useProjectStore.getState().updateClipTransform(clipId, { opacity: Math.round(v) / 100 }));
  return (
    <PanelFrame title="Opacity" onDone={onDone} onReset={() => { setOpacity(100); write.call(100); write.flush(); }}>
      <CapSlider
        label="Opacity"
        value={opacity}
        min={0}
        max={100}
        onChange={(v) => {
          setOpacity(v);
          write.call(v);
        }}
        onCommit={() => write.flush()}
      />
    </PanelFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Transform → Basic                                                   */
/* ------------------------------------------------------------------ */

type BasicTab = "position" | "rotate" | "zoom";

function BasicPanel({ clipId, onDone }: { clipId: string; onDone: () => void }) {
  const [tab, setTab] = useState<BasicTab>("position");
  const settings = useProjectStore((s) => s.project.settings);
  // Re-read on every project change so the dials follow gestures and undo.
  useProjectStore((s) => s.project);
  const playhead = useTimelineStore((s) => s.playheadPosition);
  const visual = findSelectedVisual(clipId);
  const write = useFrameThrottle((values: FlatTransform) => {
    const fresh = findSelectedVisual(clipId);
    if (fresh) applyTransform(fresh, useTimelineStore.getState().playheadPosition - fresh.startTime, values);
  });
  if (!visual) return null;
  const values = currentTransform(visual, playhead - visual.startTime);
  const media = visual.kind === "media";
  // Media positions are pixels from the centre; text and graphics are 0..1 of the frame.
  const toPx = (v: number, size: number) => (media ? v : (v - 0.5) * size);
  const fromPx = (px: number, size: number) => (media ? px : px / size + 0.5);
  const set = (patch: Partial<FlatTransform>) => write.call({ ...values, ...patch });
  const flip = Math.sign(values["scale.x"]) || 1;
  const zoom = Math.abs(values["scale.x"]) * 100;

  const reset = () => {
    write.call({ "position.x": media ? 0 : 0.5, "position.y": media ? 0 : 0.5, "scale.x": flip, "scale.y": 1, rotation: 0 });
    write.flush();
  };

  return (
    <PanelFrame
      tabs={[
        { id: "position", label: "Position" },
        { id: "rotate", label: "Rotate" },
        { id: "zoom", label: "Zoom" },
      ]}
      tab={tab}
      onTab={(id) => setTab(id as BasicTab)}
      onDone={() => {
        write.flush();
        onDone();
      }}
    >
      <div className="px-2 pb-1 pt-1">
        {tab === "position" && (
          <>
            <TickDial
              label="X"
              value={toPx(values["position.x"], settings.width)}
              min={-settings.width}
              max={settings.width}
              unitsPerTick={Math.max(2, Math.round(settings.width / 200))}
              format={(v) => `${Math.round(v)}`}
              onChange={(px) => set({ "position.x": fromPx(px, settings.width) })}
              onCommit={() => write.flush()}
            />
            <TickDial
              label="Y"
              value={toPx(values["position.y"], settings.height)}
              min={-settings.height}
              max={settings.height}
              unitsPerTick={Math.max(2, Math.round(settings.height / 200))}
              format={(v) => `${Math.round(-v)}`}
              onChange={(px) => set({ "position.y": fromPx(px, settings.height) })}
              onCommit={() => write.flush()}
            />
          </>
        )}
        {tab === "rotate" && (
          <TickDial
            label="Rotate"
            value={values.rotation}
            min={-360}
            max={360}
            unitsPerTick={1}
            format={(v) => `${Math.round(v)}°`}
            onChange={(rotation) => set({ rotation: Math.round(rotation) })}
            onCommit={() => write.flush()}
          />
        )}
        {tab === "zoom" && (
          <TickDial
            label="Zoom"
            value={zoom}
            min={10}
            max={500}
            unitsPerTick={1}
            format={(v) => `${Math.round(v)}%`}
            onChange={(z) => {
              const ratio = z / 100 / Math.max(0.0001, Math.abs(values["scale.x"]));
              set({ "scale.x": (flip * Math.round(z)) / 100, "scale.y": values["scale.y"] * ratio });
            }}
            onCommit={() => write.flush()}
          />
        )}
        <div className="flex justify-end px-3 pb-2">
          <button type="button" onClick={reset} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[12px] text-fg-2">
            <RotateCcw size={13} aria-hidden />
            Reset
          </button>
        </div>
      </div>
    </PanelFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Adjust                                                              */
/* ------------------------------------------------------------------ */

interface AdjustItem {
  key: string;
  label: string;
  icon: LucideIcon;
  type: VideoEffectType;
  /** CapCut's slider range: -50..50 or 0..100. Params use the renderer's scales (brightness, temp and tint are ±100). */
  bipolar: boolean;
  params: (ui: number) => Record<string, unknown>;
  read: (params: Record<string, unknown>) => number;
}

const num = (v: unknown, fallback: number) => (typeof v === "number" ? v : fallback);

const ADJUST_ITEMS: AdjustItem[] = [
  { key: "brightness", label: "Brightness", icon: Sun, type: "brightness", bipolar: true, params: (u) => ({ value: u }), read: (p) => num(p.value, 0) },
  { key: "contrast", label: "Contrast", icon: Contrast, type: "contrast", bipolar: true, params: (u) => ({ value: 1 + u / 100 }), read: (p) => (num(p.value, 1) - 1) * 100 },
  { key: "saturation", label: "Saturation", icon: Droplet, type: "saturation", bipolar: true, params: (u) => ({ value: 1 + u / 50 }), read: (p) => (num(p.value, 1) - 1) * 50 },
  { key: "sharpen", label: "Sharpen", icon: Triangle, type: "sharpen", bipolar: false, params: (u) => ({ amount: u * 2, radius: 1, threshold: 0 }), read: (p) => num(p.amount, 0) / 2 },
  { key: "highlights", label: "Highlights", icon: SunDim, type: "tonal", bipolar: true, params: (u) => ({ shadows: 0, midtones: 0, highlights: u / 50 }), read: (p) => num(p.highlights, 0) * 50 },
  { key: "shadows", label: "Shadows", icon: Moon, type: "tonal", bipolar: true, params: (u) => ({ shadows: u / 50, midtones: 0, highlights: 0 }), read: (p) => num(p.shadows, 0) * 50 },
  { key: "temperature", label: "Temp", icon: Thermometer, type: "temperature", bipolar: true, params: (u) => ({ value: u * 2 }), read: (p) => num(p.value, 0) / 2 },
  { key: "tint", label: "Tint", icon: Palette, type: "tint", bipolar: true, params: (u) => ({ value: u * 2 }), read: (p) => num(p.value, 0) / 2 },
  { key: "hue", label: "Hue", icon: Droplets, type: "hue", bipolar: true, params: (u) => ({ rotation: u * 1.8 }), read: (p) => num(p.rotation, 0) / 1.8 },
  { key: "vignette", label: "Vignette", icon: Aperture, type: "vignette", bipolar: false, params: (u) => ({ amount: u, midpoint: 0.5, roundness: 0.5, feather: 0.6 }), read: (p) => num(p.amount, 0) },
  { key: "grain", label: "Grain", icon: Waves, type: "grain", bipolar: false, params: (u) => ({ amount: u, size: 1.2, roughness: 0.5, colored: false }), read: (p) => num(p.amount, 0) },
];

function AdjustTab({ clipId }: { clipId: string }) {
  const [selected, setSelected] = useState(ADJUST_ITEMS[0].key);
  const effects = useVideoEffects(clipId);
  const stored = (item: AdjustItem) => {
    const effect = effects.find((e) => tagOf(e) === "adjust" && e.params.key === item.key);
    return effect ? Math.round(item.read(effect.params)) : 0;
  };
  const item = ADJUST_ITEMS.find((i) => i.key === selected) ?? ADJUST_ITEMS[0];
  const [value, setValue] = useState(() => stored(item));
  const storedValue = stored(item);
  const dragging = useRef(false);
  useEffect(() => {
    if (!dragging.current) setValue(storedValue);
  }, [storedValue, selected]);
  const write = useFrameThrottle((key: string, ui: number) => {
    const target = ADJUST_ITEMS.find((i) => i.key === key);
    if (target) void setTaggedEffect(clipId, "adjust", key, target.type, Math.round(ui) === 0 ? null : target.params(Math.round(ui)));
  });

  const applyToAll = () => {
    const mine = taggedEffects(clipId, "adjust");
    for (const clip of pictureClips()) {
      if (clip.id === clipId) continue;
      void clearTagged(clip.id, "adjust");
      for (const e of mine) void queue(() => useProjectStore.getState().addVideoEffect(clip.id, e.type, { ...e.params }));
    }
  };

  return (
    <div>
      <CapSlider
        label={item.label}
        value={value}
        min={item.bipolar ? -50 : 0}
        max={item.bipolar ? 50 : 100}
        onChange={(v) => {
          dragging.current = true;
          setValue(v);
          write.call(item.key, v);
        }}
        onCommit={() => {
          dragging.current = false;
          write.flush();
        }}
      />
      <div className="scrollbar-none flex gap-1 overflow-x-auto px-2 pb-3 pt-1">
        {ADJUST_ITEMS.map((i) => (
          <RoundItem key={i.key} icon={i.icon} label={i.label} active={i.key === selected} changed={stored(i) !== 0} onClick={() => setSelected(i.key)} />
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-border/60 px-3 py-2">
        <button type="button" onClick={() => void clearTagged(clipId, "adjust")} className="flex items-center gap-1.5 px-2 py-1.5 text-[13px] text-fg-2">
          <RotateCcw size={15} aria-hidden />
          Reset
        </button>
        <button type="button" onClick={applyToAll} className="rounded-full bg-white/10 px-3 py-1.5 text-[13px] text-fg-2">
          Apply to all
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */

/** The "no change" value of each preset param, to scale a filter's strength from. */
const NEUTRAL: Partial<Record<VideoEffectType, Record<string, number>>> = {
  brightness: { value: 0 },
  contrast: { value: 1 },
  saturation: { value: 1 },
  grayscale: { amount: 0 },
  sepia: { amount: 0 },
  invert: { amount: 0 },
  hue: { rotation: 0 },
  blur: { radius: 0 },
  sharpen: { amount: 0 },
  vignette: { amount: 0 },
  grain: { amount: 0 },
  temperature: { value: 0 },
  tint: { value: 0 },
  tonal: { shadows: 0, midtones: 0, highlights: 0 },
};

function scaledParams(type: VideoEffectType, params: Record<string, unknown>, strength: number) {
  const neutral = NEUTRAL[type] ?? {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    out[k] = typeof v === "number" && k in neutral ? neutral[k] + (v - neutral[k]) * strength : v;
  }
  return out;
}

/** A CSS approximation of a preset, for its thumbnail. */
function presetCss(preset: FilterPreset): string {
  return preset.effects
    .map(({ type, params }) => {
      const p = params as Record<string, number>;
      switch (type as string) {
        case "brightness": return `brightness(${1 + num(p.value, 0) / 100})`;
        case "contrast": return `contrast(${num(p.value, 1)})`;
        case "saturation": return `saturate(${num(p.value, 1)})`;
        case "grayscale": return `grayscale(${num(p.amount, 1)})`;
        case "sepia": return `sepia(${num(p.amount, 1)})`;
        case "invert": return `invert(${num(p.amount, 1)})`;
        case "hue": return `hue-rotate(${num(p.rotation, 0)}deg)`;
        case "temperature": return num(p.value, 0) > 0 ? `sepia(${num(p.value, 0) * 0.4})` : `hue-rotate(${num(p.value, 0) * 20}deg)`;
        default: return "";
      }
    })
    .join(" ");
}

function FiltersTab({ clipId, still }: { clipId: string; still?: string }) {
  const [category, setCategory] = useState<string>(FILTER_CATEGORIES[0].id);
  const effects = useVideoEffects(clipId);
  const applied = effects.find((e) => tagOf(e) === "filter");
  const appliedId = applied?.params.preset as string | undefined;
  const appliedStrength = num(applied?.params.strength, 100);
  const [strength, setStrength] = useState(appliedStrength);
  useEffect(() => setStrength(appliedStrength), [appliedStrength]);

  const apply = (preset: FilterPreset | null, amount: number) =>
    queue(async () => {
      const store = useProjectStore.getState();
      for (const e of taggedEffects(clipId, "filter")) await store.removeVideoEffect(clipId, e.id);
      if (!preset) return;
      for (const [i, effect] of preset.effects.entries()) {
        const type = effect.type as VideoEffectType;
        await store.addVideoEffect(clipId, type, {
          ...scaledParams(type, effect.params as Record<string, unknown>, amount / 100),
          phone: "filter",
          key: `${preset.id}-${i}`,
          preset: preset.id,
          strength: Math.round(amount),
        });
      }
    });
  const appliedPreset = FILTER_PRESETS.find((p) => p.id === appliedId) ?? null;

  return (
    <div>
      {appliedPreset && (
        <CapSlider label="Filter strength" value={strength} min={0} max={100} onChange={setStrength} onCommit={(v) => void apply(appliedPreset, v)} />
      )}
      <div className="scrollbar-none flex gap-2 overflow-x-auto px-3 py-2">
        {FILTER_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={c.id === category}
            onClick={() => setCategory(c.id)}
            className={`shrink-0 rounded-full px-3 py-1 text-[13px] ${c.id === category ? "bg-white/15 text-fg" : "text-fg-3"}`}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-2 px-3 pb-4">
        <NoneTile active={!appliedId} onClick={() => void apply(null, 100)} />
        {FILTER_PRESETS.filter((p) => p.category === category).map((p) => (
          <Tile key={p.id} label={p.name} still={still} style={{ filter: presetCss(p) }} active={p.id === appliedId} onClick={() => void apply(p, p.id === appliedId ? strength : 100)} />
        ))}
      </div>
    </div>
  );
}

/** Adjust's Filters | Adjust tabs, opened from either tool. */
function LookPanel({ clipId, initial, onDone }: { clipId: string; initial: "filters" | "adjust"; onDone: () => void }) {
  const [tab, setTab] = useState(initial);
  const [still] = useState(capturePreviewStill);
  return (
    <PanelFrame
      tabs={[
        { id: "filters", label: "Filters" },
        { id: "adjust", label: "Adjust" },
      ]}
      tab={tab}
      onTab={(id) => setTab(id as typeof tab)}
      onDone={onDone}
    >
      {tab === "filters" ? <FiltersTab clipId={clipId} still={still} /> : <AdjustTab clipId={clipId} />}
    </PanelFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */

interface EffectItem {
  key: string;
  label: string;
  type: VideoEffectType;
  params: (strength: number) => Record<string, unknown>;
  css: string;
}

const EFFECT_ITEMS: EffectItem[] = [
  { key: "blur", label: "Blur", type: "blur", params: (s) => ({ radius: 20 * s, type: "gaussian" }), css: "blur(3px)" },
  { key: "glow", label: "Glow", type: "glow", params: (s) => ({ radius: 30 * s, intensity: 0.4 + s, color: "#ffffff" }), css: "brightness(1.3) saturate(1.2)" },
  { key: "motion-blur", label: "Motion blur", type: "motion-blur", params: (s) => ({ angle: 0, distance: 50 * s }), css: "blur(1.5px)" },
  { key: "zoom-blur", label: "Zoom blur", type: "radial-blur", params: (s) => ({ amount: 60 * s, centerX: 50, centerY: 50 }), css: "blur(1px) contrast(1.1)" },
  { key: "rgb-split", label: "RGB split", type: "chromatic-aberration", params: (s) => ({ amount: 20 * s, angle: 0 }), css: "saturate(1.6) hue-rotate(-10deg)" },
  { key: "bw", label: "Black & white", type: "grayscale", params: (s) => ({ amount: s }), css: "grayscale(1)" },
  { key: "sepia", label: "Old film", type: "sepia", params: (s) => ({ amount: s }), css: "sepia(1)" },
  { key: "negative", label: "Negative", type: "invert", params: (s) => ({ amount: s }), css: "invert(1)" },
  { key: "film-grain", label: "Film grain", type: "grain", params: (s) => ({ amount: 60 * s, size: 1.8, roughness: 0.7, colored: true }), css: "contrast(1.15) saturate(0.85)" },
  { key: "dark-edges", label: "Dark edges", type: "vignette", params: (s) => ({ amount: 100 * s, midpoint: 0.4, roundness: 0.5, feather: 0.5 }), css: "brightness(0.85)" },
];

function EffectsPanel({ clipId, onDone }: { clipId: string; onDone: () => void }) {
  const [still] = useState(capturePreviewStill);
  const effects = useVideoEffects(clipId);
  const applied = effects.find((e) => tagOf(e) === "effect");
  const appliedKey = applied?.params.key as string | undefined;
  const appliedStrength = num(applied?.params.strength, 100);
  const [strength, setStrength] = useState(appliedStrength);
  useEffect(() => setStrength(appliedStrength), [appliedStrength]);
  const item = EFFECT_ITEMS.find((i) => i.key === appliedKey);

  const apply = (next: EffectItem | null, amount: number) =>
    queue(async () => {
      const store = useProjectStore.getState();
      for (const e of taggedEffects(clipId, "effect")) await store.removeVideoEffect(clipId, e.id);
      if (next) await store.addVideoEffect(clipId, next.type, { ...next.params(amount / 100), phone: "effect", key: next.key, strength: Math.round(amount) });
    });

  return (
    <PanelFrame tabs={[{ id: "video", label: "Video effects" }]} tab="video" onDone={onDone} fill>
      {item && <CapSlider label={`${item.label} strength`} value={strength} min={0} max={100} onChange={setStrength} onCommit={(v) => void apply(item, v)} />}
      <div className="grid grid-cols-4 gap-3 px-3 py-3">
        <NoneTile active={!appliedKey} onClick={() => void apply(null, 0)} />
        {EFFECT_ITEMS.map((e) => (
          <Tile key={e.key} label={e.label} still={still} style={{ filter: e.css }} autoplay active={e.key === appliedKey} onClick={() => void apply(e, e.key === appliedKey ? strength : 100)}>
            {!still && <CircleDot size={22} className="text-fg-3" aria-hidden />}
          </Tile>
        ))}
      </div>
    </PanelFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Animations                                                          */
/* ------------------------------------------------------------------ */

type AnimTab = "in" | "out" | "combo";
const ANIM_CATEGORY: Record<AnimTab, Exclude<PresetCategory, "transition">> = { in: "entrance", out: "exit", combo: "emphasis" };
const ANIM_PREFIX: Record<AnimTab, string> = { in: "motion-in-", out: "motion-out-", combo: "motion-emphasis-" };

/** Animation keyframe ids carry the preset: "motion-in-<preset>--<property>-…". */
const presetOf = (kfs: readonly Keyframe[], prefix: string) => {
  const kf = kfs.find((k) => k.id.startsWith(prefix) && k.id.includes("--"));
  return kf ? kf.id.slice(prefix.length, kf.id.indexOf("--")) : undefined;
};
const durationOf = (kfs: readonly Keyframe[], prefix: string) => {
  const times = kfs.filter((k) => k.id.startsWith(prefix)).map((k) => k.time);
  return times.length ? Math.max(...times) - Math.min(...times) : undefined;
};

/**
 * A stand-in picture for the animation tiles, so they look the same whatever
 * frame the playhead is on (the first frame of an animated clip is often blank).
 */
function AnimationPlaceholder() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden className="h-full w-full">
      <rect width="40" height="40" fill="#3a3f4b" />
      <circle cx="28" cy="12" r="4.5" fill="#e8eaef" />
      <path d="M0 40 L13 21 L22 32 L28 25 L40 40 Z" fill="#8a92a3" />
    </svg>
  );
}

function AnimationTile({ preset, active, onClick }: { preset: MotionPreset; active: boolean; onClick: () => void }) {
  const box = useRef<HTMLSpanElement>(null);
  // Every tile plays its animation on a loop, so it can be seen before it's picked.
  useEffect(() => {
    if (!box.current?.animate) return;
    const frames = buildPreviewCSSKeyframes({ ...preset, duration: 1 }).map((k, i, all) => ({
      ...k,
      // The motion takes the first 60%, then the end frame holds before it loops.
      offset: (i / (all.length - 1)) * 0.6,
      transform: String(k.transform).replace(/translate\(([-\d.]+)px, ([-\d.]+)px\)/, (_, x, y) => `translate(${Number(x) / 6}px, ${Number(y) / 6}px)`),
    }));
    const anim = box.current.animate([...frames, { ...frames[frames.length - 1], offset: 1 }], {
      duration: 1700,
      iterations: Infinity,
    });
    return () => anim.cancel();
  }, [preset]);
  return (
    <Tile label={preset.name} active={active} onClick={onClick}>
      <span ref={box} className="block h-3/5 w-3/5 overflow-hidden rounded">
        <AnimationPlaceholder />
      </span>
    </Tile>
  );
}

function AnimationsPanel({ clipId, onDone }: { clipId: string; onDone: () => void }) {
  const [tab, setTab] = useState<AnimTab>("in");
  const library = useMemo(getPresetLibrary, []);
  const visual = findSelectedVisual(clipId);
  useProjectStore((s) => s.project); // follow keyframe changes
  const settings = useProjectStore((s) => s.project.settings);
  const keyframes = visual?.keyframes ?? [];
  const prefix = ANIM_PREFIX[tab];
  const appliedId = presetOf(keyframes, prefix);
  const presets = library[ANIM_CATEGORY[tab]];
  const appliedPreset = presets.find((p) => p.id === appliedId);
  const maxDuration = Math.max(0.1, Math.min(5, (visual?.duration ?? 1) * (tab === "combo" ? 1 : 0.9)));
  const appliedDuration = durationOf(keyframes, prefix) ?? appliedPreset?.duration ?? 0.5;
  const [duration, setDuration] = useState(appliedDuration);
  useEffect(() => setDuration(appliedDuration), [appliedDuration, tab]);
  const previewTimer = useRef(0);
  // Switching tab mid-demo stops it right where it is.
  useEffect(() => {
    if (!previewTimer.current) return;
    window.clearTimeout(previewTimer.current);
    previewTimer.current = 0;
    useTimelineStore.getState().pause();
  }, [tab]);
  // So does leaving the panel.
  useEffect(
    () => () => {
      if (!previewTimer.current) return;
      window.clearTimeout(previewTimer.current);
      useTimelineStore.getState().pause();
    },
    [],
  );

  const write = (next: Keyframe[]) => {
    const store = useProjectStore.getState();
    if (visual?.kind === "media") store.updateClipKeyframes(clipId, next);
    else if (visual?.kind === "text") store.updateTextClipKeyframes(clipId, next);
  };
  const apply = (preset: MotionPreset | null, seconds: number) => {
    const fresh = findSelectedVisual(clipId);
    if (!fresh) return;
    // Combo replaces In and Out; In or Out replaces Combo, like CapCut.
    const drop = tab === "combo" ? ["motion-in-", "motion-out-", "motion-emphasis-"] : [prefix, "motion-emphasis-"];
    const rest = fresh.keyframes.filter((k) => !drop.some((p) => k.id.startsWith(p)));
    if (!preset) return write(rest);
    const generated = generateKeyframesFromPreset(
      preset,
      fresh.duration,
      fresh.transform,
      ANIM_CATEGORY[tab],
      clamp(seconds, 0.1, fresh.duration),
      { width: settings.width, height: settings.height },
    ).map((k) => ({ ...k, id: `${prefix}${preset.id}--${k.id.slice(prefix.length)}` }));
    write([...rest, ...generated]);
    // Play it once, like CapCut: from where it starts, for as long as it lasts.
    const timeline = useTimelineStore.getState();
    const length = clamp(seconds, 0.1, fresh.duration);
    const start = tab === "out" ? fresh.startTime + fresh.duration - length : tab === "combo" ? fresh.startTime + (fresh.duration - length) / 2 : fresh.startTime;
    window.clearTimeout(previewTimer.current);
    timeline.pause();
    timeline.seekTo(start);
    timeline.play();
    previewTimer.current = window.setTimeout(() => {
      previewTimer.current = 0;
      useTimelineStore.getState().pause();
    }, length * 1000 + 150);
  };

  return (
    <PanelFrame
      tabs={[
        { id: "in", label: "In" },
        { id: "out", label: "Out" },
        { id: "combo", label: "Combo" },
      ]}
      tab={tab}
      onTab={(id) => setTab(id as AnimTab)}
      onDone={onDone}
      fill
    >
      {appliedPreset && (
        <CapSlider
          label="Animation duration"
          value={duration}
          min={0.1}
          max={maxDuration}
          format={(v) => `${v.toFixed(1)}s`}
          onChange={setDuration}
          onCommit={(v) => apply(appliedPreset, v)}
        />
      )}
      <div className="grid grid-cols-4 gap-3 px-3 py-3">
        <NoneTile active={!appliedId} onClick={() => apply(null, 0)} />
        {presets.map((p) => (
          <AnimationTile
            key={p.id}
            preset={p}
            active={p.id === appliedId}
            onClick={() => apply(p, Math.min(maxDuration, p.id === appliedId ? duration : p.duration))}
          />
        ))}
      </div>
    </PanelFrame>
  );
}

/* ------------------------------------------------------------------ */

export function PhoneClipPanel({ panel, clipId, onDone }: { panel: ClipPanel; clipId: string; onDone: () => void }) {
  switch (panel) {
    case "speed":
      return <SpeedPanel clipId={clipId} onDone={onDone} />;
    case "volume":
      return <VolumePanel clipId={clipId} onDone={onDone} />;
    case "opacity":
      return <OpacityPanel clipId={clipId} onDone={onDone} />;
    case "basic":
      return <BasicPanel clipId={clipId} onDone={onDone} />;
    case "adjust":
    case "filters":
      return <LookPanel key={panel} clipId={clipId} initial={panel} onDone={onDone} />;
    case "effects":
      return <EffectsPanel clipId={clipId} onDone={onDone} />;
    case "animations":
      return <AnimationsPanel clipId={clipId} onDone={onDone} />;
  }
}

