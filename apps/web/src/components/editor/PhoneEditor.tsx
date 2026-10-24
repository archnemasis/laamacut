import React, { useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  Clapperboard,
  Copy,
  Film,
  Gauge,
  LayoutTemplate,
  Move,
  Palette,
  PaintBucket,
  Pause,
  Play,
  Proportions,
  Redo2,
  Scissors,
  Shapes,
  Shuffle,
  SlidersHorizontal,
  Captions,
  Trash2,
  Type,
  Undo2,
  Volume2,
  Wand2,
  Zap,
  type LucideIcon,
} from "@/icons/lucide-compat";
import { Toolbar } from "./Toolbar";
import { Preview } from "./Preview";
import { Timeline } from "./Timeline";
import { AssetsPanel, type AssetsTab } from "./AssetsPanel";
import { InspectorPanel } from "./InspectorPanel";
import { getTabIdsForClipType, type InspectorTabId } from "./inspector/clip-tabs.config";
import { APPS_BY_RATIO, AppIcon } from "./aspect-apps";
import { ASPECT_PRESETS, BACKGROUND_SWATCHES } from "./canvas-presets";
import { PanelErrorBoundary } from "../ErrorBoundary";
import { useProjectStore } from "../../stores/project-store";
import { useTimelineStore } from "../../stores/timeline-store";
import { useUIStore } from "../../stores/ui-store";
import {
  deleteTimelineItem,
  duplicateTimelineItem,
  getSplittableTimelineItemIds,
  splitTimelineItem,
} from "../../utils/timeline-item-actions";
import "./phone-editor.css";

type Sheet =
  | { kind: "assets"; tab: AssetsTab; title: string }
  | { kind: "inspector"; only?: InspectorTabId; title: string }
  | { kind: "ratio"; title: string }
  | { kind: "background"; title: string };

type Tool = { label: string; icon: LucideIcon; onClick: () => void; disabled?: boolean };

const formatTime = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

/** The clip-level tools, each opening one inspector section, by clip kind. */
const CLIP_SECTIONS: { label: string; icon: LucideIcon; section: InspectorTabId }[] = [
  { label: "Volume", icon: Volume2, section: "audio" },
  { label: "Speed", icon: Gauge, section: "speed" },
  { label: "Animations", icon: Film, section: "animate" },
  { label: "Adjust", icon: Palette, section: "color" },
  { label: "Effects", icon: Wand2, section: "effects" },
  { label: "Transform", icon: Move, section: "transform" },
  { label: "Captions", icon: Captions, section: "ai" },
];

function ToolButton({ tool }: { tool: Tool }) {
  const Icon = tool.icon;
  return (
    <button
      type="button"
      onClick={tool.onClick}
      disabled={tool.disabled}
      className="flex h-full w-[68px] shrink-0 flex-col items-center justify-center gap-1 text-fg disabled:opacity-35"
    >
      <Icon size={24} strokeWidth={1.6} aria-hidden />
      <span className="text-[12px] leading-tight">{tool.label}</span>
    </button>
  );
}

function RatioSheet() {
  const settings = useProjectStore((s) => s.project.settings);
  const updateSettings = useProjectStore((s) => s.updateSettings);
  return (
    <div className="grid grid-cols-3 gap-2 p-4">
      {ASPECT_PRESETS.map((opt) => {
        const active = settings.width === opt.width && settings.height === opt.height;
        return (
          <button
            key={opt.label}
            type="button"
            aria-pressed={active}
            onClick={() => void updateSettings({ width: opt.width, height: opt.height })}
            className={`flex flex-col items-center gap-2 rounded-xl border p-3 ${active ? "border-accent bg-accent-soft" : "border-border bg-bg-2"}`}
          >
            <span className="flex h-9 w-9 items-center justify-center" aria-hidden>
              <span
                className={`rounded-[3px] border-2 ${active ? "border-accent" : "border-fg-3"}`}
                style={{ width: 32 * Math.min(1, opt.width / opt.height), height: 32 * Math.min(1, opt.height / opt.width) }}
              />
            </span>
            <span className="text-[13px] font-medium">{opt.label}</span>
            <span className="flex h-3.5 items-center gap-1">
              {(APPS_BY_RATIO[opt.label] ?? []).map((icon) => (
                <AppIcon key={icon.slug} icon={icon} size={12} />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function BackgroundSheet() {
  const mode = useProjectStore((s) => s.project.timeline.backgroundFillMode);
  const color = useProjectStore((s) => s.project.timeline.layoutBackgroundColor);
  const setCanvasBackground = useProjectStore((s) => s.setCanvasBackground);
  const chip = (active: boolean) =>
    `rounded-full border px-4 py-2 text-[13px] ${active ? "border-accent bg-accent-soft" : "border-border bg-bg-2"}`;
  return (
    <div className="space-y-4 p-4">
      <p className="text-[13px] text-fg-3">Fills the space around clips that don&apos;t match the ratio.</p>
      <div className="flex gap-2">
        <button type="button" aria-pressed={!mode} className={chip(!mode)} onClick={() => setCanvasBackground(undefined, undefined)}>None</button>
        <button type="button" aria-pressed={mode === "blur"} className={chip(mode === "blur")} onClick={() => setCanvasBackground("blur", color)}>Blur</button>
      </div>
      <div className="flex flex-wrap gap-3">
        {BACKGROUND_SWATCHES.map((hex) => {
          const active = mode === "color" && color?.toLowerCase() === hex.toLowerCase();
          return (
            <button
              key={hex}
              type="button"
              aria-label={`Background color ${hex}`}
              aria-pressed={active}
              onClick={() => setCanvasBackground("color", hex)}
              className={`h-10 w-10 rounded-full border-2 ${active ? "border-accent" : "border-border"}`}
              style={{ backgroundColor: hex }}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * Phone editor in the CapCut layout: top bar, preview, transport row,
 * timeline, and a scrolling tool bar that opens panels as bottom sheets.
 * Selecting a clip swaps the tool bar for clip tools.
 */
export const PhoneEditor: React.FC = () => {
  const [sheet, setSheet] = useState<Sheet | null>(null);

  const project = useProjectStore((s) => s.project);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const canUndo = useProjectStore((s) => s.canUndo);
  const canRedo = useProjectStore((s) => s.canRedo);
  const playheadPosition = useTimelineStore((s) => s.playheadPosition);
  const playbackState = useTimelineStore((s) => s.playbackState);
  const togglePlayback = useTimelineStore((s) => s.togglePlayback);
  const selectedItems = useUIStore((s) => s.selectedItems);
  const clearSelection = useUIStore((s) => s.clearSelection);

  const selectedIds = useMemo(
    () => selectedItems.filter((item) => item.type === "clip").map((item) => item.id),
    [selectedItems],
  );
  const isPlaying = playbackState === "playing";

  // Media clips live on tracks; text, shapes and stickers are overlays.
  const mediaKind = useMemo(() => {
    if (selectedIds.length !== 1) return null;
    for (const track of project.timeline.tracks) {
      const clip = track.clips.find((c) => c.id === selectedIds[0]);
      if (clip) {
        const type = project.mediaLibrary.items.find((m) => m.id === clip.mediaId)?.type;
        return type === "audio" || type === "image" ? type : "video";
      }
    }
    return null;
  }, [selectedIds, project.timeline.tracks, project.mediaLibrary.items]);

  const canSplit = getSplittableTimelineItemIds(project, selectedIds, playheadPosition).length > 0;

  const open = (next: Sheet) => setSheet(next);

  const mainTools: Tool[] = [
    { label: "Media", icon: Clapperboard, onClick: () => open({ kind: "assets", tab: "media", title: "Media" }) },
    { label: "Text", icon: Type, onClick: () => open({ kind: "assets", tab: "text", title: "Text" }) },
    { label: "Graphics", icon: Shapes, onClick: () => open({ kind: "assets", tab: "graphics", title: "Graphics" }) },
    { label: "Effects", icon: Zap, onClick: () => open({ kind: "assets", tab: "effects", title: "Effects" }) },
    { label: "Transitions", icon: Shuffle, onClick: () => open({ kind: "assets", tab: "transitions", title: "Transitions" }) },
    { label: "Ratio", icon: Proportions, onClick: () => open({ kind: "ratio", title: "Aspect ratio" }) },
    { label: "Background", icon: PaintBucket, onClick: () => open({ kind: "background", title: "Background" }) },
    { label: "Templates", icon: LayoutTemplate, onClick: () => open({ kind: "assets", tab: "templates", title: "Templates" }) },
  ];

  const sectionTools: Tool[] = mediaKind
    ? CLIP_SECTIONS.filter(({ section }) => getTabIdsForClipType(mediaKind).includes(section)).map(
        ({ label, icon, section }) => ({
          label,
          icon,
          onClick: () => open({ kind: "inspector", only: section, title: label }),
        }),
      )
    : [{ label: "Edit", icon: SlidersHorizontal, onClick: () => open({ kind: "inspector", title: "Edit" }) }];

  const clipTools: Tool[] = [
    {
      label: "Split",
      icon: Scissors,
      disabled: !canSplit,
      onClick: () => {
        const store = useProjectStore.getState();
        void (async () => {
          for (const id of getSplittableTimelineItemIds(store.project, selectedIds, playheadPosition)) {
            await splitTimelineItem(store, id, playheadPosition);
          }
        })();
      },
    },
    ...sectionTools,
    {
      label: "Duplicate",
      icon: Copy,
      onClick: () => {
        const store = useProjectStore.getState();
        void (async () => {
          for (const id of selectedIds) await duplicateTimelineItem(store, id);
        })();
      },
    },
    {
      label: "Delete",
      icon: Trash2,
      onClick: () => {
        const store = useProjectStore.getState();
        void (async () => {
          for (const id of selectedIds) await deleteTimelineItem(store, id);
          clearSelection();
        })();
      },
    },
  ];

  const hasSelection = selectedIds.length > 0;

  return (
    <div className="phone-editor flex h-full w-full flex-col overflow-hidden bg-bg text-fg">
      <Toolbar phone />

      <div className="phone-preview min-h-0 shrink-0 basis-[36%]">
        <PanelErrorBoundary name="Stage">
          <Preview />
        </PanelErrorBoundary>
      </div>

      <div className="grid h-14 shrink-0 grid-cols-3 items-center px-4">
        <span className="font-mono text-[13px] text-fg-2">
          <span className="text-fg">{formatTime(playheadPosition)}</span> / {formatTime(project.timeline.duration ?? 0)}
        </span>
        <button
          type="button"
          aria-label={isPlaying ? "Pause" : "Play"}
          onClick={() => togglePlayback()}
          className="mx-auto grid h-11 w-11 place-items-center rounded-full text-fg"
        >
          {isPlaying ? <Pause size={26} fill="currentColor" aria-hidden /> : <Play size={26} aria-hidden />}
        </button>
        <div className="flex justify-end gap-1">
          <button type="button" aria-label="Undo" disabled={!canUndo()} onClick={() => void undo()} className="grid h-10 w-10 place-items-center text-fg disabled:opacity-35">
            <Undo2 size={22} aria-hidden />
          </button>
          <button type="button" aria-label="Redo" disabled={!canRedo()} onClick={() => void redo()} className="grid h-10 w-10 place-items-center text-fg disabled:opacity-35">
            <Redo2 size={22} aria-hidden />
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="phone-timeline min-h-0 flex-1">
          <PanelErrorBoundary name="Timeline">
            <Timeline />
          </PanelErrorBoundary>
        </div>

        <nav aria-label={hasSelection ? "Clip tools" : "Editor tools"} className="flex h-[76px] shrink-0 items-stretch border-t border-border bg-bg">
          {hasSelection && (
            <button
              type="button"
              aria-label="Back to editor tools"
              onClick={clearSelection}
              className="my-2 ml-2 grid w-11 shrink-0 place-items-center rounded-lg bg-bg-2 text-fg"
            >
              <ChevronLeft size={24} aria-hidden />
            </button>
          )}
          <div className="flex min-w-0 flex-1 overflow-x-auto scrollbar-none">
            {(hasSelection ? clipTools : mainTools).map((tool) => (
              <ToolButton key={tool.label} tool={tool} />
            ))}
          </div>
        </nav>

        {sheet && (
          <section
            role="dialog"
            aria-label={sheet.title}
            className="absolute inset-0 z-[100] flex flex-col overflow-hidden rounded-t-2xl border-t border-border bg-bg-1 shadow-lg"
          >
            <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
              <span className="text-[15px] font-semibold">{sheet.title}</span>
              <button type="button" aria-label="Done" onClick={() => setSheet(null)} className="grid h-10 w-10 place-items-center rounded-full text-accent">
                <Check size={24} aria-hidden />
              </button>
            </header>
            <div className="phone-sheet-body min-h-0 flex-1 overflow-y-auto">
              {sheet.kind === "assets" && (
                <PanelErrorBoundary name={sheet.title}>
                  <AssetsPanel tab={sheet.tab} hideRail />
                </PanelErrorBoundary>
              )}
              {sheet.kind === "inspector" && (
                <PanelErrorBoundary name={sheet.title}>
                  <InspectorPanel only={sheet.only} />
                </PanelErrorBoundary>
              )}
              {sheet.kind === "ratio" && <RatioSheet />}
              {sheet.kind === "background" && <BackgroundSheet />}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
