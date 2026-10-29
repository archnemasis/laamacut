import { useState, useCallback, useEffect, lazy, Suspense } from "react";
import {
  Clock,
  Layers,
  ArrowRight,
  FolderOpen,
  Plus,
} from "@/icons/lucide-compat";
import { ToolcraftSwitchControl } from "@openreel/ui";
import { ToolcraftButton as Button } from "@openreel/ui";
import { ToolcraftText as Text } from "@openreel/ui";
import { useProjectStore } from "../../stores/project-store";
import { useUIStore } from "../../stores/ui-store";
import { NEW_PROJECT_SETTINGS, newProjectName } from "../../services/new-project";
import { useRouter } from "../../hooks/use-router";
import { editorPreloadProps } from "../../hooks/useEditorPreload";
import { useAnalytics, AnalyticsEvents } from "../../hooks/useAnalytics";
import llamaUrl from "../../assets/laamacut-llama.png?url";

const TemplateGallery = lazy(() =>
  import("./TemplateGallery").then((module) => ({ default: module.TemplateGallery })),
);
const RecentProjects = lazy(() =>
  import("./RecentProjects").then((module) => ({ default: module.RecentProjects })),
);

const LoadingView = () => <div role="status" className="p-6 text-center text-text-secondary">Loading…</div>;

const OpenReelLogo: React.FC<{ className?: string }> = ({ className = "" }) => (
  <img src={llamaUrl} alt="" className={className} draggable={false} />
);

const isDesktopApp = typeof window !== "undefined" && window.openreel?.platform === "desktop";

type ViewMode = "home" | "templates" | "recent";

interface WelcomeScreenProps {
  initialTab?: "templates" | "recent";
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ initialTab }) => {
  const setSkipWelcomeScreen = useUIStore(
    (state) => state.setSkipWelcomeScreen,
  );
  const skipWelcomeScreen = useUIStore((state) => state.skipWelcomeScreen);
  const createNewProject = useProjectStore((state) => state.createNewProject);
  const { navigate } = useRouter();
  const { track } = useAnalytics();

  const [viewMode, setViewMode] = useState<ViewMode>(initialTab ?? "home");

  const handleCreateProject = useCallback(() => {
    createNewProject(newProjectName(), NEW_PROJECT_SETTINGS);
    track(AnalyticsEvents.PROJECT_CREATED, {
      preset: "default",
      ...NEW_PROJECT_SETTINGS,
      source: "quick_start",
    });
    navigate("editor");
  }, [createNewProject, navigate, track]);

  const handleTemplateApplied = useCallback(() => {
    navigate("editor");
  }, [navigate]);

  const handleProjectSelected = useCallback(() => {
    navigate("editor");
  }, [navigate]);

  useEffect(() => {
    if (skipWelcomeScreen) {
      navigate("editor");
    }
  }, [skipWelcomeScreen, navigate]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (viewMode !== "home") {
          setViewMode("home");
        } else {
          navigate("editor");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, viewMode]);

  if (viewMode === "templates") {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 border-b border-border">
          <Button
            label="Back"
            variant="ghost"
            size="sm"
            icon={<ArrowRight className="rotate-180" size={16} aria-hidden />}
            onClick={() => setViewMode("home")}
          />
          <Text type="label" color="primary" weight="medium" className="text-sm text-text-primary">Templates</Text>
          <div className="w-16" />
        </header>
        <div className="flex-1 overflow-y-auto p-6">
          <Suspense fallback={<LoadingView />}>
            <TemplateGallery onTemplateApplied={handleTemplateApplied} />
          </Suspense>
        </div>
      </div>
    );
  }

  if (viewMode === "recent") {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 border-b border-border">
          <Button
            label="Back"
            variant="ghost"
            size="sm"
            icon={<ArrowRight className="rotate-180" size={16} aria-hidden />}
            onClick={() => setViewMode("home")}
          />
          <Text type="label" color="primary" weight="medium" className="text-sm text-text-primary">
            Recent Projects
          </Text>
          <div className="w-16" />
        </header>
        <div className="flex-1 overflow-y-auto p-6">
          <Suspense fallback={<LoadingView />}>
            <RecentProjects onProjectSelected={handleProjectSelected} />
          </Suspense>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(147,51,234,0.05),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(147,51,234,0.03),transparent_50%)]" />

      <div className="relative h-full flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-3xl">
          <div className="flex flex-col items-center text-center mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 text-primary">
                <OpenReelLogo className="w-full h-full" />
              </div>
              <Text type="body" color="primary" weight="semibold" className="text-xl text-text-primary tracking-tight">
                Laamacut
              </Text>
            </div>

            <Text display="block" type="body" color="primary" weight="bold" className="text-4xl sm:text-5xl text-text-primary tracking-tight mb-3">
              From idea to export.
            </Text>
            <Text display="block" type="supporting" color="secondary" className="text-xl text-text-secondary mb-8">
              {isDesktopApp ? "On your PC." : "In your browser."}
            </Text>
            <Text display="block" type="supporting" color="secondary" className="text-base text-text-muted max-w-md">
              Pick the ratio in the editor. Name, quality, frame rate and bitrate are set when you export.
            </Text>
          </div>

          <div className="mb-10 flex justify-center">
            <button
              type="button"
              onClick={handleCreateProject}
              {...editorPreloadProps}
              className="group flex h-40 w-full max-w-xl items-center justify-center gap-4 rounded-2xl border border-border bg-bg-1 text-fg transition-colors hover:border-accent hover:bg-accent-soft focus-visible:border-accent focus-visible:outline-none"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-fg transition-transform group-hover:scale-105">
                <Plus size={28} aria-hidden />
              </span>
              <span className="text-2xl font-semibold">Create project</span>
            </button>
          </div>

          <div className="flex items-center justify-center gap-3">
            <Button
              label="Browse templates"
              variant="secondary"
              icon={<Layers size={16} aria-hidden />}
              onClick={() => setViewMode("templates")}
              className="rounded-xl"
            />
            <Button
              label="Recent projects"
              variant="secondary"
              icon={<Clock size={16} aria-hidden />}
              onClick={() => setViewMode("recent")}
              className="rounded-xl"
            />
            <Button
              {...editorPreloadProps}
              label="Open editor"
              variant="secondary"
              icon={<FolderOpen size={16} aria-hidden />}
              onClick={() => navigate("editor")}
              className="rounded-xl"
            />
          </div>
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <ToolcraftSwitchControl
              label="Skip on startup"
              checked={skipWelcomeScreen}
              onCheckedChange={setSkipWelcomeScreen}
            />
          </div>

          <span className="text-text-muted/30">·</span>

          <Text type="supporting" color="secondary" className="text-xs text-text-muted/60">
            Press{" "}
            <kbd className="px-1.5 py-0.5 bg-background-tertiary border border-border rounded text-text-muted font-mono text-[10px]">
              Esc
            </kbd>{" "}
            to skip
          </Text>
        </div>
      </div>

    </div>
  );
};

export default WelcomeScreen;
