import type { JSX } from "react";
import type React from "react";
import { lazy, Suspense, useEffect, useState } from "react";
import { ToolcraftText as Text } from "@openreel/ui";

import { AssetsPanel, type AssetsTab } from "../../components/editor/AssetsPanel";
import { InspectorPanel } from "../../components/editor/InspectorPanel";
import { PanelErrorBoundary } from "../../components/ErrorBoundary";
import { Icon } from "@/icons/Icon";
import { useResizable } from "../editor/useResizable";
import { useProjectStore } from "../../stores/project-store";
import { AudioMixer } from "../../components/audio-mixer";
import { useDesktopPage, type DesktopPage } from "../shell/desktop-page";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { KeyboardShortcutsOverlay } from "../../components/editor/KeyboardShortcutsOverlay";
import {
  AudioLines,
  Clapperboard,
  Keyboard,
  LayoutTemplate,
  Shapes,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Type,
  Zap,
  type LucideIcon,
} from "@/icons/lucide-compat";

const Preview = lazy(() =>
  import("../../components/editor/Preview").then((m) => ({ default: m.Preview })),
);
const Timeline = lazy(() =>
  import("../../components/editor/Timeline").then((m) => ({ default: m.Timeline })),
);

function PanelLoading(): JSX.Element {
  return (
    <div className="grid h-full place-items-center">
      <Text type="supporting" color="secondary" className="text-xs">
        Loading…
      </Text>
    </div>
  );
}

/** Panels the left half of Resolve's interface toolbar opens, as media panel tabs. */
const MEDIA_PANELS: { tab: AssetsTab; label: string; icon: LucideIcon }[] = [
  { tab: "media", label: "Media Pool", icon: Clapperboard },
  { tab: "effects", label: "Effects", icon: Zap },
  { tab: "transitions", label: "Transitions", icon: Shuffle },
  { tab: "text", label: "Titles", icon: Type },
  { tab: "graphics", label: "Graphics", icon: Shapes },
  { tab: "recipes", label: "Looks", icon: Sparkles },
  { tab: "templates", label: "Templates", icon: LayoutTemplate },
];

function ToolbarToggle({
  label,
  icon: IconComponent,
  active,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick(): void;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-7 items-center gap-1.5 rounded px-2.5 text-[12px] transition-colors ${
        active ? "bg-bg-3 text-fg" : "text-fg-3 hover:bg-hover hover:text-fg-2"
      }`}
    >
      <IconComponent size={14} strokeWidth={1.7} aria-hidden />
      {label}
    </button>
  );
}

function DockRegion({
  label,
  name,
  area,
  icon,
  className,
  children,
}: {
  label: string;
  name: string;
  area: string;
  icon: string;
  className?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div
      className={`relative flex min-h-0 min-w-0 flex-col overflow-hidden ${className ?? "bg-bg-1"}`}
      style={{ gridArea: area }}
    >
      <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-border bg-bg-1 px-3 text-[12px] font-semibold text-fg-2">
        <Icon name={icon} size={12} className="text-fg-muted" />
        <Text type="supporting" color="secondary" weight="semibold" className="text-[12px]">
          {label}
        </Text>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <PanelErrorBoundary name={name}>{children}</PanelErrorBoundary>
      </div>
    </div>
  );
}

function ColumnHandle({
  edge,
  onPointerDown,
}: {
  edge: "left" | "right";
  onPointerDown(e: React.PointerEvent): void;
}): JSX.Element {
  const position = edge === "left" ? "left-0" : "right-0";
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      className={`absolute top-0 ${position} z-10 h-full w-1.5 cursor-col-resize bg-border transition-colors hover:bg-accent/40`}
    />
  );
}

function RowHandle({
  onPointerDown,
}: {
  onPointerDown(e: React.PointerEvent): void;
}): JSX.Element {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      onPointerDown={onPointerDown}
      className="absolute left-0 top-0 z-10 h-1.5 w-full cursor-row-resize bg-border transition-colors hover:bg-accent/40"
    />
  );
}

/** What each page shows when it opens; the toolbar can still change it after. */
const PAGE_LAYOUTS: Record<DesktopPage, { media: AssetsTab | null; inspector: boolean; mixer: boolean }> = {
  media: { media: "media", inspector: false, mixer: false },
  edit: { media: "media", inspector: true, mixer: false },
  color: { media: "recipes", inspector: true, mixer: false },
  audio: { media: null, inspector: false, mixer: true },
};

export function EditPage(): JSX.Element {
  const projectName = useProjectStore((s) => s.project.name);
  const page = useDesktopPage((s) => s.page);
  // Like Resolve, each toolbar button shows or hides its panel.
  const [mediaPanel, setMediaPanel] = useState<AssetsTab | null>("media");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [mixerOpen, setMixerOpen] = useState(false);
  const { showShortcutsOverlay, setShowShortcutsOverlay } = useKeyboardShortcuts();
  useEffect(() => {
    const layout = PAGE_LAYOUTS[page];
    setMediaPanel(layout.media);
    setInspectorOpen(layout.inspector);
    setMixerOpen(layout.mixer);
  }, [page]);
  const mediaW = useResizable({
    initial: 320,
    min: 220,
    max: 520,
    axis: "x",
    direction: 1,
    storageKey: "openreel-desktop-media-w",
  });
  const inspectorW = useResizable({
    initial: 340,
    min: 260,
    max: 560,
    axis: "x",
    direction: -1,
    storageKey: "openreel-desktop-inspector-w",
  });
  const timelineH = useResizable({
    initial: 320,
    min: 160,
    max: 640,
    axis: "y",
    direction: -1,
    storageKey: "openreel-desktop-timeline-h",
  });

  // The media page is a big media pool beside a smaller viewer, with no timeline.
  const mediaColumn = page === "media" ? "minmax(0, 3fr)" : `${mediaW.value}px`;
  const stageColumn = page === "media" ? "minmax(0, 2fr)" : "1fr";
  const columns = [mediaPanel && mediaColumn, stageColumn, inspectorOpen && `${inspectorW.value}px`, mixerOpen && "auto"].filter(Boolean);
  const topAreas = [mediaPanel && "media", "stage", inspectorOpen && "inspector", mixerOpen && "mixer"].filter(Boolean);
  const showTimeline = page !== "media";
  const gridStyle: React.CSSProperties = {
    gridTemplateColumns: columns.join(" "),
    gridTemplateRows: showTimeline ? `1fr ${timelineH.value}px` : "1fr",
    gridTemplateAreas: showTimeline
      ? `'${topAreas.join(" ")}' '${topAreas.map(() => "timeline").join(" ")}'`
      : `'${topAreas.join(" ")}'`,
  };
  const activePanel = MEDIA_PANELS.find((panel) => panel.tab === mediaPanel);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-border">
      <div role="toolbar" aria-label="Interface" className="flex h-10 shrink-0 items-center gap-1 border-b border-border bg-bg-1 px-2">
        {MEDIA_PANELS.map((panel) => (
          <ToolbarToggle
            key={panel.tab}
            label={panel.label}
            icon={panel.icon}
            active={mediaPanel === panel.tab}
            onClick={() => setMediaPanel(mediaPanel === panel.tab ? null : panel.tab)}
          />
        ))}
        <span className="mx-auto truncate px-4 text-[12px] font-medium text-fg-2">{projectName}</span>
        <ToolbarToggle
          label="Mixer"
          icon={AudioLines}
          active={mixerOpen}
          onClick={() => setMixerOpen(!mixerOpen)}
        />
        <ToolbarToggle
          label="Inspector"
          icon={SlidersHorizontal}
          active={inspectorOpen}
          onClick={() => setInspectorOpen(!inspectorOpen)}
        />
        <ToolbarToggle
          label="Shortcuts"
          icon={Keyboard}
          active={showShortcutsOverlay}
          onClick={() => setShowShortcutsOverlay(!showShortcutsOverlay)}
        />
      </div>
      <div
        className="grid min-h-0 w-full flex-1 gap-px overflow-hidden bg-border"
        style={gridStyle}
        data-testid="desktop-edit-page"
      >
        {activePanel && (
          <DockRegion label={activePanel.label} name="Media" area="media" icon="photo.on.rectangle">
            <AssetsPanel tab={activePanel.tab} hideRail />
            <ColumnHandle edge="right" onPointerDown={mediaW.onHandlePointerDown} />
          </DockRegion>
        )}

        <DockRegion label="Viewer" name="Viewer" area="stage" icon="play.fill" className="bg-stage-bg">
          <Suspense fallback={<PanelLoading />}>
            <Preview />
          </Suspense>
        </DockRegion>

        {inspectorOpen && (
          <DockRegion label="Inspector" name="Inspector" area="inspector" icon="slider.horizontal.3">
            <InspectorPanel />
            <ColumnHandle edge="left" onPointerDown={inspectorW.onHandlePointerDown} />
          </DockRegion>
        )}

        {mixerOpen && (
          <DockRegion label="Mixer" name="Mixer" area="mixer" icon="slider.horizontal.3">
            <div className="h-full overflow-auto">
              <AudioMixer visible onClose={() => setMixerOpen(false)} />
            </div>
          </DockRegion>
        )}

        {showTimeline && (
          <DockRegion label="Timeline" name="Timeline" area="timeline" icon="rectangle.split.3x1" className="bg-tl-bg">
            <Suspense fallback={<PanelLoading />}>
              <Timeline />
            </Suspense>
            <RowHandle onPointerDown={timelineH.onHandlePointerDown} />
          </DockRegion>
        )}
      </div>
      <KeyboardShortcutsOverlay isOpen={showShortcutsOverlay} onClose={() => setShowShortcutsOverlay(false)} />
    </div>
  );
}

export default EditPage;
