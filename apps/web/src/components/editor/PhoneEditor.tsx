import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
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
  Shuffle,
  SlidersHorizontal,
  Captions,
  Maximize,
  Music,
  Scissors as EditIcon,
  Sparkles as LooksIcon,
  Sticker,
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
import { PhoneTimeline } from "./PhoneTimeline";
import { PhoneMediaPicker } from "../phone/PhoneMediaPicker";
import { takePhoneMediaPickerRequest } from "../../services/phone-media";
import { useRouter } from "../../hooks/use-router";
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

/** Clip tools, in CapCut order; each opens one inspector section. "delete" marks where Delete goes. */
const CLIP_SECTIONS: ({ label: string; icon: LucideIcon; section: InspectorTabId } | "delete")[] = [
  { label: "Volume", icon: Volume2, section: "audio" },
  { label: "Animations", icon: Film, section: "animate" },
  { label: "Effects", icon: Wand2, section: "effects" },
  "delete",
  { label: "Speed", icon: Gauge, section: "speed" },
  { label: "Adjust", icon: Palette, section: "color" },
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
  // New projects open straight into the media picker, like CapCut.
  const [pickerOpen, setPickerOpen] = useState(false);
  const startedFromNewProject = useRef(false);
  const { navigate } = useRouter();
  useEffect(() => {
    if (takePhoneMediaPickerRequest()) {
      startedFromNewProject.current = true;
      setPickerOpen(true);
    }
  }, []);
  // Backing out of the picker on a new, still-empty project returns home.
  const closePicker = () => {
    setPickerOpen(false);
    const empty = (useProjectStore.getState().project.timeline.duration ?? 0) === 0;
    if (startedFromNewProject.current && empty) navigate("welcome");
    startedFromNewProject.current = false;
  };

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
  const select = useUIStore((s) => s.select);
  const previewRef = useRef<HTMLDivElement>(null);

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

  // Like CapCut, Edit, Adjust and Captions act on the picture clip under the playhead.
  const openForMainClip = (only: InspectorTabId | undefined, title: string) => {
    const pictures = project.timeline.tracks.flatMap((track) =>
      track.clips.filter((c) => project.mediaLibrary.items.find((m) => m.id === c.mediaId)?.type !== "audio"),
    );
    const clip =
      pictures.find((c) => playheadPosition >= c.startTime && playheadPosition < c.startTime + c.duration) ??
      pictures[0];
    if (!clip) {
      setPickerOpen(true);
      return;
    }
    select({ type: "clip", id: clip.id, trackId: clip.trackId });
    if (only) open({ kind: "inspector", only, title });
  };

  const mainTools: Tool[] = [
    { label: "Edit", icon: EditIcon, onClick: () => openForMainClip(undefined, "Edit") },
    { label: "Audio", icon: Music, onClick: () => open({ kind: "assets", tab: "media", title: "Audio" }) },
    { label: "Text", icon: Type, onClick: () => open({ kind: "assets", tab: "text", title: "Text" }) },
    { label: "Effects", icon: Zap, onClick: () => open({ kind: "assets", tab: "effects", title: "Effects" }) },
    { label: "Transitions", icon: Shuffle, onClick: () => open({ kind: "assets", tab: "transitions", title: "Transitions" }) },
    { label: "Captions", icon: Captions, onClick: () => openForMainClip("ai", "Captions") },
    { label: "Looks", icon: LooksIcon, onClick: () => open({ kind: "assets", tab: "recipes", title: "Looks" }) },
    { label: "Adjust", icon: SlidersHorizontal, onClick: () => openForMainClip("color", "Adjust") },
    { label: "Stickers", icon: Sticker, onClick: () => open({ kind: "assets", tab: "graphics", title: "Stickers" }) },
    { label: "Aspect ratio", icon: Proportions, onClick: () => open({ kind: "ratio", title: "Aspect ratio" }) },
    { label: "Background", icon: PaintBucket, onClick: () => open({ kind: "background", title: "Background" }) },
    { label: "Templates", icon: LayoutTemplate, onClick: () => open({ kind: "assets", tab: "templates", title: "Templates" }) },
  ];

  const deleteTool: Tool = {
    label: "Delete",
    icon: Trash2,
    onClick: () => {
      const store = useProjectStore.getState();
      void (async () => {
        for (const id of selectedIds) await deleteTimelineItem(store, id);
        clearSelection();
      })();
    },
  };

  const sectionTools: Tool[] = mediaKind
    ? CLIP_SECTIONS.flatMap((entry): Tool[] => {
        if (entry === "delete") return [deleteTool];
        if (!getTabIdsForClipType(mediaKind).includes(entry.section)) return [];
        return [{ label: entry.label, icon: entry.icon, onClick: () => open({ kind: "inspector", only: entry.section, title: entry.label }) }];
      })
    : [{ label: "Edit", icon: SlidersHorizontal, onClick: () => open({ kind: "inspector", title: "Edit" }) }, deleteTool];

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
  ];

  const hasSelection = selectedIds.length > 0;

  return (
    <div className="phone-editor flex h-full w-full flex-col overflow-hidden bg-bg text-fg">
      <Toolbar phone />

      <div ref={previewRef} className="phone-preview min-h-0 shrink-0 basis-[38%] bg-black">
        <PanelErrorBoundary name="Stage">
          <Preview />
        </PanelErrorBoundary>
      </div>

      <div className="grid h-14 shrink-0 grid-cols-3 items-center px-3">
        <button
          type="button"
          aria-label="Full screen preview"
          onClick={() => void previewRef.current?.requestFullscreen?.()}
          className="grid h-10 w-10 place-items-center text-fg"
        >
          <Maximize size={22} aria-hidden />
        </button>
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
        <div className="min-h-0 flex-1">
          <PanelErrorBoundary name="Timeline">
            <PhoneTimeline
              onAddMedia={() => setPickerOpen(true)}
              onAddAudio={() => open({ kind: "assets", tab: "media", title: "Audio" })}
              onAddText={() => open({ kind: "assets", tab: "text", title: "Text" })}
            />
          </PanelErrorBoundary>
        </div>

        <nav aria-label={hasSelection ? "Clip tools" : "Editor tools"} className="flex h-[84px] shrink-0 items-stretch bg-bg pb-1">
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

        {pickerOpen && <PhoneMediaPicker onClose={closePicker} />}

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
