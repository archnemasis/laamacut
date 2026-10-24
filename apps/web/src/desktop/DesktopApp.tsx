import type { JSX } from "react";
import { useEffect } from "react";
import { DesktopTitleBar } from "./shell/DesktopTitleBar";
import { Workspace } from "./shell/Workspace";
import { DesktopStartScreen } from "./start/DesktopStartScreen";
import { DesktopExportButton } from "./editor/DesktopExportButton";
import { EditorBootstrapGate } from "./editor/EditorBootstrapGate";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { useProjectStore } from "../stores/project-store";
import { autoSaveManager } from "../services/auto-save";
import { UpdateBanner } from "./UpdateBanner";
import { installRendererCrashHandlers, reportRendererCrash } from "./crash-reporting";
import { installMcpListener } from "../services/agent/mcp-listener";
import { getLiveEditorHost } from "../services/agent/host-singleton";
import { createExportJobRunner } from "../services/agent/export-job-runner";
import { useSettingsStore } from "../stores/settings-store";
import { useThemeStore } from "../stores/theme-store";
import { SettingsDialog } from "../components/editor/settings/SettingsDialog";
import { MoreHorizontal } from "@/icons/lucide-compat";
import { captureProjectPreview } from "../services/project-previews";
import "./theme/desktop-theme.css";

function detectPlatform(): string {
  if (typeof navigator !== "undefined" && /Mac/i.test(navigator.platform)) return "darwin";
  if (typeof navigator !== "undefined" && /Win/i.test(navigator.platform)) return "win32";
  return "linux";
}

export function DesktopApp(): JSX.Element {
  const platform = detectPlatform();
  const hasProject = useProjectStore((state) => state.hasOpenProject);

  // Drive native-menu actions into the app: undo/redo hit the project store
  // directly; new/open/export are broadcast as events for the relevant UI to
  // pick up (e.g. the export button opens its dialog on "export").
  useEffect(() => {
    const bridge = window.openreel;
    if (!bridge?.onMenuAction) return;
    return bridge.onMenuAction((id) => {
      switch (id) {
        case "undo":
          void useProjectStore.getState().undo();
          break;
        case "redo":
          void useProjectStore.getState().redo();
          break;
        case "newProject":
        case "open":
        case "export":
          window.dispatchEvent(new CustomEvent(`openreel:menu:${id}`));
          break;
        case "settings":
          useSettingsStore.getState().openSettings();
          break;
      }
    });
  }, []);

  // Dialogs and menus portal to <body>, so the desktop tokens and the chosen
  // theme (Settings → Appearance) have to live on <html>, not only on the app.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("openreel-desktop");
    const theme = useThemeStore.getState();
    theme.setMode(theme.mode);
    return () => root.classList.remove("openreel-desktop");
  }, []);

  // Refresh the start screen preview of the open project whenever it saves.
  useEffect(() => {
    const onSaved = () => {
      void captureProjectPreview(useProjectStore.getState().project);
    };
    autoSaveManager.on("saved", onSaved);
    return () => autoSaveManager.off("saved", onSaved);
  }, []);

  // Forward uncaught renderer errors + unhandled rejections to the native crash
  // collector so editor-side faults are captured alongside main-process crashes.
  useEffect(() => installRendererCrashHandlers(), []);

  // Serve main-process MCP tool calls against the live editor so external MCP
  // clients drive the open project through the same tool layer as the chat panel.
  // Also back the export_* job tools with a runner that renders via the export
  // engine and uploads the artifact to R2, returning a presigned download URL.
  useEffect(() => {
    getLiveEditorHost().setJobRunner(createExportJobRunner());
    return installMcpListener();
  }, []);

  // Answer the native unsaved-changes guard on window close / quit: report
  // dirty state and flush pending changes on request.
  useEffect(() => {
    const lifecycle = window.openreel?.lifecycle;
    if (!lifecycle) return;
    const offQuery = lifecycle.onQueryUnsaved(() =>
      autoSaveManager.hasUnsavedChanges(useProjectStore.getState().getFullProject()),
    );
    const offFlush = lifecycle.onFlush(() =>
      useProjectStore.getState().forceSave(),
    );
    return () => {
      offQuery();
      offFlush();
    };
  }, []);

  return (
    <div className="openreel-desktop isolate flex h-screen w-screen flex-col overflow-hidden bg-bg text-fg">
      <DesktopTitleBar platform={platform}>
        {hasProject ? <DesktopExportButton /> : null}
      </DesktopTitleBar>
      <div className="min-h-0 flex-1">
        <ErrorBoundary
          onError={(error, info) =>
            reportRendererCrash({
              type: "react-error",
              message: error.message,
              stack: error.stack,
              context: { componentStack: info.componentStack },
            })
          }
        >
          {hasProject ? (
            <EditorBootstrapGate>
              <Workspace />
            </EditorBootstrapGate>
          ) : (
            <DesktopStartScreen />
          )}
        </ErrorBoundary>
      </div>
      <UpdateBanner />
      <button
        type="button"
        aria-label="Settings"
        title="Settings"
        onClick={() => useSettingsStore.getState().openSettings()}
        className="fixed bottom-4 right-4 z-40 grid h-10 w-10 place-items-center rounded-full border border-border bg-bg-1 text-fg-2 shadow-md transition-colors hover:border-accent hover:text-fg focus-visible:border-accent focus-visible:outline-none"
      >
        <MoreHorizontal size={20} aria-hidden />
      </button>
      <SettingsDialog />
    </div>
  );
}
