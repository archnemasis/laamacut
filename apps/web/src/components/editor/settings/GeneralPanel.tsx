import React, { useState } from "react";
import { ToolcraftSwitchControl } from "@openreel/ui";
import { ToolcraftClickableCard as ClickableCard } from "@openreel/ui";
import { ToolcraftSelectControl as Selector } from "@openreel/ui";
import { ToolcraftText as Text } from "@openreel/ui";
import { useSettingsStore } from "../../../stores/settings-store";
import { useProjectStore } from "../../../stores/project-store";
import { useUIStore } from "../../../stores/ui-store";
import { keyboardShortcuts } from "../../../services/keyboard-shortcuts";
import { EDITING_FRAME_RATE_OPTIONS } from "../editing-frame-rate";
import type { PreviewQuality } from "../preview/preview-resolution";

const BACKGROUND_SWATCHES = [
  "#000000",
  "#FFFFFF",
  "#1E1E1E",
  "#2563EB",
  "#DC2626",
  "#16A34A",
  "#F59E0B",
  "#9333EA",
  "#DB2777",
  "#0EA5E9",
];

const PREVIEW_QUALITY_CHOICES: { value: PreviewQuality; label: string }[] = [
  { value: "auto", label: "Auto (matches the player size)" },
  { value: "full", label: "Full" },
  { value: "half", label: "Half" },
  { value: "quarter", label: "Quarter" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1">
      <Text display="block" type="body" color="primary" className="pb-1 text-sm font-semibold">
        {title}
      </Text>
      <div className="divide-y divide-border rounded-lg border border-border bg-background-tertiary px-3">
        {children}
      </div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <Text display="block" type="supporting" color="primary" className="text-sm">
          {label}
        </Text>
        {hint && (
          <Text display="block" type="supporting" color="secondary" className="mt-0.5 text-xs">
            {hint}
          </Text>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export const GeneralPanel: React.FC = () => {
  const { autoSave, autoSaveInterval, setAutoSave, setAutoSaveInterval } = useSettingsStore();

  const snapSettings = useUIStore((s) => s.snapSettings);
  const setSnapEnabled = useUIStore((s) => s.setSnapEnabled);
  const setSnapToClips = useUIStore((s) => s.setSnapToClips);
  const setSnapToPlayhead = useUIStore((s) => s.setSnapToPlayhead);
  const setSnapToGrid = useUIStore((s) => s.setSnapToGrid);
  const playbackQuality = useUIStore((s) => s.playbackQuality);
  const setPlaybackQuality = useUIStore((s) => s.setPlaybackQuality);

  const [shortcutPreset, setShortcutPreset] = useState(() => keyboardShortcuts.getActivePreset());

  const hasOpenProject = useProjectStore((s) => s.hasOpenProject);
  const projectFrameRate = useProjectStore((s) => s.project.settings.frameRate);
  const updateProjectSettings = useProjectStore((s) => s.updateSettings);
  const backgroundFillMode = useProjectStore((s) => s.project.timeline.backgroundFillMode);
  const layoutBackgroundColor = useProjectStore((s) => s.project.timeline.layoutBackgroundColor);
  const setCanvasBackground = useProjectStore((s) => s.setCanvasBackground);

  return (
    <div className="space-y-5 pb-4">
      <Section title="Saving">
        <Row label="Auto-save" hint="Save your project automatically while you edit">
          <ToolcraftSwitchControl
            ariaLabel="Auto-save"
            checked={autoSave}
            onCheckedChange={setAutoSave}
            showLabel={false}
          />
        </Row>
        {autoSave && (
          <Row label="Save every">
            <Selector
              label="Auto-save interval"
              isLabelHidden
              size="md"
              width={160}
              value={String(autoSaveInterval)}
              onChange={(value) => setAutoSaveInterval(Number(value))}
              options={[
                { label: "1 minute", value: "1" },
                { label: "2 minutes", value: "2" },
                { label: "5 minutes", value: "5" },
                { label: "10 minutes", value: "10" },
                { label: "15 minutes", value: "15" },
                { label: "30 minutes", value: "30" },
              ]}
            />
          </Row>
        )}
      </Section>

      <Section title="Playback">
        <Row label="Preview quality" hint="Lower quality plays smoother on slower computers. Exports are not affected.">
          <Selector
            label="Preview quality"
            isLabelHidden
            size="md"
            width={230}
            value={playbackQuality}
            onChange={(value) => setPlaybackQuality(value as PreviewQuality)}
            options={PREVIEW_QUALITY_CHOICES}
          />
        </Row>
      </Section>

      <Section title="Timeline">
        <Row label="Snapping" hint="Clips snap into place while you drag them (N)">
          <ToolcraftSwitchControl
            ariaLabel="Snapping"
            checked={snapSettings.enabled}
            onCheckedChange={setSnapEnabled}
            showLabel={false}
          />
        </Row>
        {snapSettings.enabled && (
          <>
            <Row label="Snap to clip edges">
              <ToolcraftSwitchControl
                ariaLabel="Snap to clip edges"
                checked={snapSettings.snapToClips}
                onCheckedChange={setSnapToClips}
                showLabel={false}
              />
            </Row>
            <Row label="Snap to playhead">
              <ToolcraftSwitchControl
                ariaLabel="Snap to playhead"
                checked={snapSettings.snapToPlayhead}
                onCheckedChange={setSnapToPlayhead}
                showLabel={false}
              />
            </Row>
            <Row label="Snap to grid">
              <ToolcraftSwitchControl
                ariaLabel="Snap to grid"
                checked={snapSettings.snapToGrid}
                onCheckedChange={setSnapToGrid}
                showLabel={false}
              />
            </Row>
          </>
        )}
      </Section>

      <Section title="Keyboard">
        <Row label="Shortcut layout" hint="Use the keyboard shortcuts of the editor you know">
          <Selector
            label="Shortcut layout"
            isLabelHidden
            size="md"
            width={200}
            value={shortcutPreset}
            onChange={(value) => {
              keyboardShortcuts.applyPreset(value);
              setShortcutPreset(value);
            }}
            options={keyboardShortcuts.getPresets().map((preset) => ({
              label: preset.name,
              value: preset.id,
            }))}
          />
        </Row>
      </Section>

      {hasOpenProject && (
        <Section title="This project">
          <Row label="Editing frame rate" hint="Preview playback and frame stepping. Export frame rate is set when you export.">
            <Selector
              label="Editing frame rate"
              isLabelHidden
              size="md"
              width={160}
              value={String(projectFrameRate)}
              onChange={(value) => {
                const frameRate = Number(value);
                if (Number.isFinite(frameRate) && frameRate > 0) {
                  void updateProjectSettings({ frameRate });
                }
              }}
              options={EDITING_FRAME_RATE_OPTIONS.map((option) => ({
                label: option.label,
                value: String(option.value),
              }))}
            />
          </Row>
          <div className="space-y-2 py-2.5">
            <Text display="block" type="supporting" color="primary" className="text-sm">
              Background fill
            </Text>
            <Text display="block" type="supporting" color="secondary" className="text-xs">
              Fills the canvas around clips that don&apos;t match the ratio.
            </Text>
            <div className="flex flex-wrap items-center gap-2">
              <ClickableCard
                label="No background fill"
                onClick={() => setCanvasBackground(undefined, undefined)}
                padding={2}
                variant={!backgroundFillMode ? "green" : "muted"}
                className={`border px-3 py-1.5 text-xs ${
                  !backgroundFillMode
                    ? "border-primary bg-primary/10 text-text-primary"
                    : "border-border bg-background-tertiary text-text-secondary hover:text-text-primary"
                }`}
              >
                None
              </ClickableCard>
              <ClickableCard
                label="Blur background fill"
                onClick={() => setCanvasBackground("blur", layoutBackgroundColor)}
                padding={2}
                variant={backgroundFillMode === "blur" ? "green" : "muted"}
                className={`border px-3 py-1.5 text-xs ${
                  backgroundFillMode === "blur"
                    ? "border-primary bg-primary/10 text-text-primary"
                    : "border-border bg-background-tertiary text-text-secondary hover:text-text-primary"
                }`}
              >
                Blur
              </ClickableCard>
              {BACKGROUND_SWATCHES.map((hex) => {
                const isActive =
                  backgroundFillMode === "color" &&
                  layoutBackgroundColor?.toLowerCase() === hex.toLowerCase();
                return (
                  <ClickableCard
                    key={hex}
                    label={`Background color ${hex}`}
                    onClick={() => setCanvasBackground("color", hex)}
                    padding={0}
                    variant="transparent"
                    style={{ backgroundColor: hex }}
                    className={`h-6 w-6 rounded-full border-2 transition-transform ${
                      isActive ? "border-primary scale-110" : "border-border hover:scale-105"
                    }`}
                  />
                );
              })}
            </div>
          </div>
        </Section>
      )}
    </div>
  );
};
