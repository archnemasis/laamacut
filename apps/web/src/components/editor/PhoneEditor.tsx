import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Blend,
  Check,
  ChevronLeft,
  FlipHorizontal2,
  Replace,
  RotateCw,
  Scaling,
  Copy,
  Diamond,
  DiamondPlus,
  Film,
  Gauge,
  Layers,
  LayoutTemplate,
  Mic,
  Move,
  Palette,
  PaintBucket,
  Pause,
  Pencil,
  Play,
  Proportions,
  Redo2,
  Scissors,
  Shuffle,
  SlidersHorizontal,
  Captions,
  Loader2,
  Maximize,
  Music,
  Plus,
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
import { PhoneFullscreenControls } from "./PhoneFullscreenControls";
import { PhoneTimeline } from "./PhoneTimeline";
import { PhoneTextEditor, type TextEditorTab } from "./PhoneTextEditor";
import { PhoneAutoCaptions } from "./PhoneAutoCaptions";
import { PhoneGestures } from "./PhoneGestures";
import { applyTransform, currentTransform, findSelectedVisual, hasKeyframeAt, toggleKeyframe, type FlatTransform } from "./phone-keyframes";
import { PhoneClipPanel, type ClipPanel } from "./PhoneClipPanels";
import { PhoneMediaPicker } from "../phone/PhoneMediaPicker";
import { takePhoneMediaPickerRequest, usePhoneImportStore } from "../../services/phone-media";
import { autoSaveManager } from "../../services/auto-save";
import { captureProjectPreview } from "../../services/project-previews";
import { restoreGalleryPreviewCopies } from "../../services/phone-gallery";
import { useRouter } from "../../hooks/use-router";
import { AssetsPanel, DEFAULT_TITLE_STYLE, type AssetsTab } from "./AssetsPanel";
import { InspectorPanel } from "./InspectorPanel";
import { VoiceOverPanel } from "./inspector/VoiceOverPanel";
import type { InspectorTabId } from "./inspector/clip-tabs.config";
import { APPS_BY_RATIO, AppIcon } from "./aspect-apps";
import { ASPECT_PRESETS, BACKGROUND_SWATCHES } from "./canvas-presets";
import { PanelErrorBoundary } from "../ErrorBoundary";
import { useProjectStore } from "../../stores/project-store";
import { insertTimelineOverlay } from "../../stores/project/insert-timeline-overlay";
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
  | { kind: "background"; title: string }
  | { kind: "voiceover"; title: string };

/** CapCut's second-level tool rows, opened from Audio and Text. */
type Menu = "audio" | "text";

type Tool = { label: string; icon: LucideIcon; onClick: () => void; disabled?: boolean };

/** Second-level row inside the clip tools. */
type ClipMenu = "transform";

const PANELS: ClipPanel[] = ["speed", "volume", "opacity", "basic", "adjust", "filters", "animations", "effects"];

function ToolButton({ tool }: { tool: Tool }) {
  const Icon = tool.icon;
  return (
    <button
      type="button"
      onClick={tool.onClick}
      disabled={tool.disabled}
      className="flex h-full w-[64px] shrink-0 flex-col items-center justify-center gap-1.5 text-fg disabled:opacity-35"
    >
      <Icon size={22} strokeWidth={1.5} aria-hidden />
      <span className="text-[11px] leading-tight">{tool.label}</span>
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
 * timeline, and a scrolling tool bar. Audio and Text open a second row of
 * tools; selecting a clip swaps the tool bar for clip tools.
 */
export const PhoneEditor: React.FC = () => {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [clipMenu, setClipMenu] = useState<ClipMenu | null>(null);
  const [panel, setPanel] = useState<ClipPanel | null>(null);
  const [captionsOpen, setCaptionsOpen] = useState(false);
  const replaceInput = useRef<HTMLInputElement>(null);
  const [textEdit, setTextEdit] = useState<{ clipId: string; isNew: boolean; tab?: TextEditorTab } | null>(null);
  // New projects open straight into the media picker, like CapCut.
  const [pickerOpen, setPickerOpen] = useState(false);
  const startedFromNewProject = useRef(false);
  const soundInput = useRef<HTMLInputElement>(null);
  const overlayInput = useRef<HTMLInputElement>(null);
  // The preview only draws a frame on play or seek; ask it to redraw when the
  // editor opens and whenever clips or media change, so a picture always shows.
  const mediaItems = useProjectStore((s) => s.project.mediaLibrary.items);
  const tracks = useProjectStore((s) => s.project.timeline.tracks);
  useEffect(() => {
    const redraw = () => window.dispatchEvent(new Event("openreel:preview-invalidate"));
    const timers = [150, 700, 2000].map((ms) => window.setTimeout(redraw, ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [mediaItems, tracks]);
  // Heavy gallery videos edit from small preview copies kept on the phone;
  // a reopened project gets them back instead of decoding the full-size originals.
  useEffect(() => restoreGalleryPreviewCopies(mediaItems), [mediaItems]);
  const { navigate } = useRouter();
  // Keep the home screen's cover for this project fresh whenever it saves.
  useEffect(() => {
    const onSaved = () => void captureProjectPreview(useProjectStore.getState().project);
    autoSaveManager.on("saved", onSaved);
    return () => autoSaveManager.off("saved", onSaved);
  }, []);
  useEffect(() => {
    if (takePhoneMediaPickerRequest()) {
      startedFromNewProject.current = true;
      setPickerOpen(true);
    }
  }, []);
  // Backing out of the picker on a new, still-empty project returns home.
  const closePicker = (adding?: boolean) => {
    setPickerOpen(false);
    const empty = (useProjectStore.getState().project.timeline.duration ?? 0) === 0;
    if (startedFromNewProject.current && empty && !adding) navigate("welcome");
    startedFromNewProject.current = false;
  };

  const project = useProjectStore((s) => s.project);
  const importing = usePhoneImportStore((s) => s.loading);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const canUndo = useProjectStore((s) => s.canUndo);
  const canRedo = useProjectStore((s) => s.canRedo);
  // Not followed during playback: re-rendering the whole editor on every
  // frame makes playback choppy on phones. Actions read the live playhead.
  const playheadPosition =
    useTimelineStore((s) => (s.playbackState === "playing" ? null : s.playheadPosition)) ??
    useTimelineStore.getState().playheadPosition;
  const playheadNow = () => useTimelineStore.getState().playheadPosition;
  const playbackState = useTimelineStore((s) => s.playbackState);
  const togglePlayback = useTimelineStore((s) => s.togglePlayback);
  const selectedItems = useUIStore((s) => s.selectedItems);
  const clearSelection = useUIStore((s) => s.clearSelection);
  const select = useUIStore((s) => s.select);
  const previewRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === previewRef.current && previewRef.current !== null);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  const selectedIds = useMemo(
    () => selectedItems.filter((item) => item.type === "clip" || item.type === "text-clip" || item.type === "shape-clip").map((item) => item.id),
    [selectedItems],
  );
  const isPlaying = playbackState === "playing";
  // A different selection starts again from the clip's own tool row.
  const selectionKey = selectedIds.join(",");
  useEffect(() => {
    setPanel(null);
    setClipMenu(null);
  }, [selectionKey]);

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
  const selectedText =
    selectedIds.length === 1 && (project.textClips ?? []).some((c) => c.id === selectedIds[0]) ? selectedIds[0] : null;

  const canSplit = getSplittableTimelineItemIds(project, selectedIds, playheadPosition).length > 0;

  // The selected picture, text or graphic: what preview gestures and the keyframe button act on.
  const selectedVisual = useMemo(
    () => (selectedIds.length === 1 ? findSelectedVisual(selectedIds[0]) : null),
    // project changes whenever the clip's transform or keyframes do
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedIds, project],
  );
  const keyframeHere = selectedVisual ? hasKeyframeAt(selectedVisual.keyframes, playheadPosition - selectedVisual.startTime) : false;

  const open = (next: Sheet) => setSheet(next);

  // Like CapCut, Edit, Adjust and Captions act on the picture clip under the playhead.
  const openForMainClip = (only: InspectorTabId | ClipPanel | undefined, title: string) => {
    const pictures = project.timeline.tracks.flatMap((track) =>
      track.clips.filter((c) => project.mediaLibrary.items.find((m) => m.id === c.mediaId)?.type !== "audio"),
    );
    const clip =
      pictures.find((c) => playheadNow() >= c.startTime && playheadNow() < c.startTime + c.duration) ??
      pictures[0];
    if (!clip) {
      setPickerOpen(true);
      return;
    }
    select({ type: "clip", id: clip.id, trackId: clip.trackId });
    if (only && (PANELS as string[]).includes(only)) {
      // After the selection effect has reset the panel.
      window.setTimeout(() => setPanel(only as ClipPanel), 0);
    } else if (only) open({ kind: "inspector", only: only as InspectorTabId, title });
  };

  /** Add a text clip at the playhead and open the text editor, like CapCut's Add text. */
  const addText = async () => {
    const at = useTimelineStore.getState().playheadPosition;
    const created = await insertTimelineOverlay(at, 3, (trackId) =>
      useProjectStore.getState().createTextClip(trackId, at, "Enter text", 3, { ...DEFAULT_TITLE_STYLE, fontSize: 72 }),
    );
    if (!created) return;
    setMenu(null);
    select({ type: "text-clip", id: created.id, trackId: created.trackId });
    setTextEdit({ clipId: created.id, isNew: true });
  };

  /** Sounds and Overlay: import the picked files and lay them on new tracks at the playhead. */
  const addAtPlayhead = async (files: FileList | null) => {
    if (!files) return;
    const at = useTimelineStore.getState().playheadPosition;
    const store = useProjectStore.getState;
    for (const file of Array.from(files)) {
      const imported = await store().importMedia(file);
      if (imported.success && imported.actionId) await store().addClipToNewTrack(imported.actionId, at);
    }
    setMenu(null);
  };

  const mainTools: Tool[] = [
    { label: "Edit", icon: EditIcon, onClick: () => openForMainClip(undefined, "Edit") },
    { label: "Audio", icon: Music, onClick: () => setMenu("audio") },
    { label: "Text", icon: Type, onClick: () => setMenu("text") },
    { label: "Effects", icon: Zap, onClick: () => openForMainClip("effects", "Effects") },
    { label: "Overlay", icon: Layers, onClick: () => overlayInput.current?.click() },
    { label: "Filters", icon: LooksIcon, onClick: () => openForMainClip("filters", "Filters") },
    { label: "Adjust", icon: SlidersHorizontal, onClick: () => openForMainClip("adjust", "Adjust") },
    { label: "Transitions", icon: Shuffle, onClick: () => open({ kind: "assets", tab: "transitions", title: "Transitions" }) },
    { label: "Aspect ratio", icon: Proportions, onClick: () => open({ kind: "ratio", title: "Aspect ratio" }) },
    { label: "Background", icon: PaintBucket, onClick: () => open({ kind: "background", title: "Background" }) },
    { label: "Templates", icon: LayoutTemplate, onClick: () => open({ kind: "assets", tab: "templates", title: "Templates" }) },
  ];

  const menuTools: Record<Menu, Tool[]> = {
    audio: [
      { label: "Sounds", icon: Music, onClick: () => soundInput.current?.click() },
      { label: "Record", icon: Mic, onClick: () => open({ kind: "voiceover", title: "Record" }) },
    ],
    text: [
      { label: "Add text", icon: Plus, onClick: () => void addText() },
      { label: "Auto captions", icon: Captions, onClick: () => setCaptionsOpen(true) },
      { label: "Stickers", icon: Sticker, onClick: () => open({ kind: "assets", tab: "graphics", title: "Stickers" }) },
      { label: "Text template", icon: Type, onClick: () => open({ kind: "assets", tab: "text", title: "Text template" }) },
    ],
  };

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

  const splitTool: Tool = {
    label: "Split",
    icon: Scissors,
    disabled: !canSplit,
    onClick: () => {
      const store = useProjectStore.getState();
      void (async () => {
        const at = playheadNow();
        for (const id of getSplittableTimelineItemIds(store.project, selectedIds, at)) {
          await splitTimelineItem(store, id, at);
        }
      })();
    },
  };
  const duplicateTool: Tool = {
    label: "Duplicate",
    icon: Copy,
    onClick: () => {
      const store = useProjectStore.getState();
      void (async () => {
        for (const id of selectedIds) await duplicateTimelineItem(store, id);
      })();
    },
  };

  const panelTool = (label: string, icon: LucideIcon, kind: ClipPanel): Tool => ({ label, icon, onClick: () => setPanel(kind) });
  /** Rotate and Mirror act on the clip right away; Basic opens the dials. */
  const nudgeTransform = (change: (t: FlatTransform) => Partial<FlatTransform>) => {
    if (!selectedVisual) return;
    const time = playheadNow() - selectedVisual.startTime;
    const values = currentTransform(selectedVisual, time);
    applyTransform(selectedVisual, time, { ...values, ...change(values) });
  };
  const transformTools: Tool[] = [
    { label: "Rotate", icon: RotateCw, onClick: () => nudgeTransform((t) => ({ rotation: ((Math.round(t.rotation / 90) * 90 + 90 + 540) % 360) - 180 })) },
    { label: "Mirror", icon: FlipHorizontal2, onClick: () => nudgeTransform((t) => ({ "scale.x": -t["scale.x"] })) },
    panelTool("Basic", Scaling, "basic"),
  ];

  const mediaTools: Tool[] =
    mediaKind === "audio"
      ? [splitTool, panelTool("Volume", Volume2, "volume"), panelTool("Speed", Gauge, "speed"), deleteTool, duplicateTool]
      : [
          splitTool,
          ...(mediaKind === "video" ? [panelTool("Volume", Volume2, "volume")] : []),
          panelTool("Animations", Film, "animations"),
          panelTool("Effects", Wand2, "effects"),
          deleteTool,
          ...(mediaKind === "video" ? [panelTool("Speed", Gauge, "speed")] : []),
          duplicateTool,
          { label: "Replace", icon: Replace, onClick: () => replaceInput.current?.click() },
          panelTool("Adjust", Palette, "adjust"),
          panelTool("Filters", LooksIcon, "filters"),
          panelTool("Opacity", Blend, "opacity"),
          { label: "Transform", icon: Move, onClick: () => setClipMenu("transform") },
          { label: "More", icon: SlidersHorizontal, onClick: () => open({ kind: "inspector", title: "Edit" }) },
        ];

  const clipTools: Tool[] = selectedText
    ? [
        // Like CapCut, selected text gets its own tools; only Edit brings up the keyboard.
        { label: "Edit", icon: Pencil, onClick: () => setTextEdit({ clipId: selectedText, isNew: false, tab: "keyboard" }) },
        { label: "Font", icon: Type, onClick: () => setTextEdit({ clipId: selectedText, isNew: false, tab: "fonts" }) },
        { label: "Style", icon: Palette, onClick: () => setTextEdit({ clipId: selectedText, isNew: false, tab: "styles" }) },
        { label: "Animation", icon: Film, onClick: () => setTextEdit({ clipId: selectedText, isNew: false, tab: "animations" }) },
        splitTool,
        deleteTool,
        duplicateTool,
      ]
    : mediaKind
      ? clipMenu === "transform" ? transformTools : mediaTools
      : [splitTool, { label: "Adjust", icon: SlidersHorizontal, onClick: () => open({ kind: "inspector", title: "Edit" }) }, deleteTool, duplicateTool];

  /** Replace: swap the clip's file, keeping its place and edits. */
  const replaceClipMedia = async (files: FileList | null) => {
    const file = files?.[0];
    const clip = project.timeline.tracks.flatMap((t) => t.clips).find((c) => c.id === selectedIds[0]);
    if (file && clip) await useProjectStore.getState().replaceMediaAsset(clip.mediaId, file);
  };

  const hasSelection = selectedIds.length > 0;
  const tools = hasSelection ? clipTools : menu ? menuTools[menu] : mainTools;
  const back = hasSelection
    ? clipMenu
      ? { label: "Back to clip tools", onClick: () => setClipMenu(null) }
      : { label: "Back to editor tools", onClick: clearSelection }
    : menu
      ? { label: "Back to all tools", onClick: () => setMenu(null) }
      : null;

  return (
    <div className="phone-editor flex h-full w-full flex-col overflow-hidden bg-bg text-fg">
      <Toolbar phone />

      <div ref={previewRef} className="phone-preview relative min-h-0 shrink-0 basis-[48%] bg-[var(--stage-bg)]">
        <PanelErrorBoundary name="Stage">
          <Preview />
        </PanelErrorBoundary>
        {importing && (
          <div role="status" className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black text-white/80">
            <Loader2 size={28} className="animate-spin" aria-hidden />
            <span className="text-[13px]">{importing}</span>
          </div>
        )}
        {selectedVisual && !isPlaying && !fullscreen && (
          <PhoneGestures selectedId={selectedVisual.id} onTapText={(clipId) => setTextEdit({ clipId, isNew: false })} />
        )}
        {fullscreen && <PhoneFullscreenControls onExit={() => void document.exitFullscreen?.()} />}
      </div>

      <div className="grid h-12 shrink-0 grid-cols-3 items-center px-3">
        <button
          type="button"
          aria-label="Full screen preview"
          onClick={() => void previewRef.current?.requestFullscreen?.()}
          className="grid h-10 w-10 place-items-center text-fg"
        >
          <Maximize size={20} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={isPlaying ? "Pause" : "Play"}
          onClick={() => togglePlayback()}
          className="mx-auto grid h-11 w-11 place-items-center rounded-full text-fg"
        >
          {isPlaying ? <Pause size={24} fill="currentColor" aria-hidden /> : <Play size={24} aria-hidden />}
        </button>
        <div className="flex justify-end gap-1">
          {selectedVisual && selectedVisual.kind !== "shape" && (
            <button
              type="button"
              aria-label={keyframeHere ? "Remove keyframe" : "Add keyframe"}
              aria-pressed={keyframeHere}
              onClick={() => toggleKeyframe(selectedVisual, playheadNow() - selectedVisual.startTime)}
              className={`grid h-10 w-10 place-items-center ${keyframeHere ? "text-accent" : "text-fg"}`}
            >
              {keyframeHere ? <Diamond size={20} fill="currentColor" aria-hidden /> : <DiamondPlus size={20} aria-hidden />}
            </button>
          )}
          <button type="button" aria-label="Undo" disabled={!canUndo()} onClick={() => void undo()} className="grid h-10 w-10 place-items-center text-fg disabled:opacity-35">
            <Undo2 size={20} aria-hidden />
          </button>
          <button type="button" aria-label="Redo" disabled={!canRedo()} onClick={() => void redo()} className="grid h-10 w-10 place-items-center text-fg disabled:opacity-35">
            <Redo2 size={20} aria-hidden />
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">
          <PanelErrorBoundary name="Timeline">
            <PhoneTimeline
              onAddMedia={() => setPickerOpen(true)}
              onAddAudio={() => setMenu("audio")}
              onAddText={() => void addText()}
            />
          </PanelErrorBoundary>
        </div>

        <nav aria-label={hasSelection ? "Clip tools" : menu ? `${menu === "audio" ? "Audio" : "Text"} tools` : "Editor tools"} className="flex h-[76px] shrink-0 items-stretch border-t border-border/60 bg-bg pb-1">
          {back && (
            <button
              type="button"
              aria-label={back.label}
              onClick={back.onClick}
              className="my-2 ml-2 grid w-10 shrink-0 place-items-center rounded-lg bg-bg-2 text-fg"
            >
              <ChevronLeft size={22} aria-hidden />
            </button>
          )}
          <div className="scrollbar-none flex min-w-0 flex-1 overflow-x-auto">
            {tools.map((tool) => (
              <ToolButton key={tool.label} tool={tool} />
            ))}
          </div>
        </nav>

        <input ref={soundInput} type="file" accept="audio/*" multiple hidden onChange={(e) => void addAtPlayhead(e.target.files).finally(() => (e.target.value = ""))} />
        <input ref={replaceInput} type="file" accept="video/*,image/*" hidden onChange={(e) => void replaceClipMedia(e.target.files).finally(() => (e.target.value = ""))} />
        <input ref={overlayInput} type="file" accept="video/*,image/*" multiple hidden onChange={(e) => void addAtPlayhead(e.target.files).finally(() => (e.target.value = ""))} />

        {panel && selectedIds.length === 1 && (
          <PanelErrorBoundary name="Clip tool">
            <PhoneClipPanel panel={panel} clipId={selectedIds[0]} onDone={() => setPanel(null)} />
          </PanelErrorBoundary>
        )}

        {pickerOpen && <PhoneMediaPicker onClose={closePicker} />}

        {/* Nothing can be touched until picked media has loaded in. */}
        {importing && <div aria-hidden className="fixed inset-0 z-[500]" onPointerDownCapture={(e) => e.preventDefault()} />}

        {textEdit && (
          <div className="absolute inset-0 z-[110]">
            <PanelErrorBoundary name="Text">
              <PhoneTextEditor clipId={textEdit.clipId} isNew={textEdit.isNew} initialTab={textEdit.tab} onDone={() => setTextEdit(null)} />
            </PanelErrorBoundary>
          </div>
        )}

        {captionsOpen && (
          <PanelErrorBoundary name="Auto captions">
            <PhoneAutoCaptions onClose={() => setCaptionsOpen(false)} />
          </PanelErrorBoundary>
        )}

        {sheet && (
          <section
            role="dialog"
            aria-label={sheet.title}
            className="absolute inset-0 z-[100] flex flex-col overflow-hidden rounded-t-2xl border-t border-border bg-bg-1 shadow-lg"
          >
            <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
              <span className="text-[15px] font-semibold">{sheet.title}</span>
              <button type="button" aria-label="Done" onClick={() => setSheet(null)} className="grid h-10 w-10 place-items-center rounded-full text-fg">
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
              {sheet.kind === "voiceover" && (
                <PanelErrorBoundary name={sheet.title}>
                  <VoiceOverPanel />
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
