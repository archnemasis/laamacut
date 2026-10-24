import type { JSX } from "react";
import { useState, useEffect, useCallback } from "react";
import { ToolcraftCard as Card } from "@openreel/ui";
import { ToolcraftClickableCard as ClickableCard } from "@openreel/ui";
import { ToolcraftHeading as Heading } from "@openreel/ui";
import { ToolcraftText as Text } from "@openreel/ui";
import { Film, Plus } from "@/icons/lucide-compat";

import { OpenReelMark } from "../brand/OpenReelMark";
import { Icon } from "@/icons/Icon";
import {
  startNewProject,
  listRecentProjects,
  openRecentProject,
  type RecentEntry,
} from "./desktop-project-actions";
import { useUIStore } from "../../stores/ui-store";

function formatSavedAt(savedAt: number): string {
  const date = new Date(savedAt);
  const diffDays = Math.floor((Date.now() - savedAt) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

export function DesktopStartScreen(): JSX.Element {
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const [loadingRecents, setLoadingRecents] = useState<boolean>(true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const setDesktopPage = useUIStore((state) => state.setDesktopPage);

  useEffect(() => {
    let active = true;
    listRecentProjects()
      .then((entries) => {
        if (active) setRecents(entries);
      })
      .catch(() => {
        if (active) setRecents([]);
      })
      .finally(() => {
        if (active) setLoadingRecents(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleOpenRecent = useCallback(async (saveId: string) => {
    setOpeningId(saveId);
    try {
      setDesktopPage("edit");
      await openRecentProject(saveId);
    } finally {
      setOpeningId(null);
    }
  }, [setDesktopPage]);

  const handleStartProject = useCallback(() => {
    setDesktopPage("edit");
    startNewProject();
  }, [setDesktopPage]);

  return (
    <div className="h-full overflow-y-auto bg-bg text-fg">
      <div className="mx-auto flex max-w-4xl flex-col gap-10 px-8 py-12">
        <section>
          <div className="flex items-center gap-3">
            <OpenReelMark size={28} className="text-accent" />
            <Heading level={1}>New Project</Heading>
          </div>
          <Text type="supporting" display="block" className="mt-1">
            Pick the ratio in the editor. Name, quality, frame rate and bitrate are set when you export.
          </Text>
          <button
            type="button"
            onClick={handleStartProject}
            className="group mt-6 flex h-40 w-full items-center justify-center gap-4 rounded-xl border border-border bg-bg-1 text-fg transition-colors hover:border-accent hover:bg-accent-soft focus-visible:border-accent focus-visible:outline-none"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-fg transition-transform group-hover:scale-105">
              <Plus size={28} aria-hidden />
            </span>
            <span className="text-2xl font-semibold">Create project</span>
          </button>
        </section>

        <section>
          <Heading level={2} color="secondary">Recent</Heading>
          <Card className="mt-3" padding={0}>
            {loadingRecents ? (
              <Text type="supporting" display="block" className="px-4 py-6">
                Loading recent projects...
              </Text>
            ) : recents.length === 0 ? (
              <Text type="supporting" display="block" className="px-4 py-6">
                No recent projects yet. Start a new project above.
              </Text>
            ) : (
              <ul className="divide-y divide-border">
                {recents.map((entry) => (
                  <li key={entry.id} className="p-1.5">
                    <ClickableCard
                      label={`Open ${entry.name}`}
                      isDisabled={openingId === entry.id}
                      onClick={() => handleOpenRecent(entry.id)}
                      padding={2}
                      variant="transparent"
                    >
                      <div className="flex items-center gap-3">
                        <Icon name="clock" size={14} ariaHidden className="text-fg-muted" />
                        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-bg-3 text-fg-muted">
                          <Film size={16} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <Text type="body" weight="bold" display="block" maxLines={1}>
                            {entry.name}
                          </Text>
                          <Text type="supporting" display="block" className="mt-0.5">
                            {formatSavedAt(entry.savedAt)}
                          </Text>
                        </span>
                      </div>
                    </ClickableCard>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}
