import type { JSX } from "react";
import { useState, useEffect, useCallback } from "react";
import { ToolcraftHeading as Heading } from "@openreel/ui";
import { ToolcraftText as Text } from "@openreel/ui";
import { Film, Plus, Trash2 } from "@/icons/lucide-compat";

import { OpenReelMark } from "../brand/OpenReelMark";
import {
  startNewProject,
  listRecentProjects,
  openRecentProject,
  deleteRecentProject,
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

function RecentProjectCard({
  entry,
  isOpening,
  onOpen,
  onDelete,
}: {
  entry: RecentEntry;
  isOpening: boolean;
  onOpen: () => void;
  onDelete: () => void;
}): JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const preview = entry.preview;
  const shapeScale = preview ? 64 / Math.max(preview.width, preview.height) : 0;
  return (
    <li className="group relative overflow-hidden rounded-xl border border-border bg-bg-1 transition-colors hover:border-accent">
      <button
        type="button"
        aria-label={`Open ${entry.name}`}
        disabled={isOpening || confirming}
        onClick={onOpen}
        className="block w-full text-left focus-visible:outline-none"
      >
        <span className="flex aspect-video w-full items-center justify-center bg-bg-3">
          {preview?.image ? (
            <img src={preview.image} alt="" className="h-full w-full object-contain" draggable={false} />
          ) : preview ? (
            <span
              className="flex items-center justify-center rounded-md border-2 border-fg-muted text-fg-muted"
              style={{ width: preview.width * shapeScale, height: preview.height * shapeScale }}
            >
              <Film size={18} aria-hidden />
            </span>
          ) : (
            <Film size={36} className="text-fg-muted" aria-hidden />
          )}
        </span>
        <span className="block px-3 py-2.5">
          <Text type="body" weight="bold" display="block" maxLines={1}>
            {entry.name}
          </Text>
          <Text type="supporting" display="block" className="mt-0.5">
            {formatSavedAt(entry.savedAt)}
          </Text>
        </span>
      </button>
      {confirming ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg/90 p-4 text-center">
          <Text type="body" weight="bold" display="block">Delete "{entry.name}"?</Text>
          <Text type="supporting" display="block">This removes it from Recent. Your media files are kept.</Text>
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirming(false)} className="rounded-md border border-border bg-bg-2 px-3 py-1.5 text-sm text-fg hover:bg-hover">
              Cancel
            </button>
            <button type="button" onClick={onDelete} className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500">
              Delete
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          aria-label={`Delete ${entry.name}`}
          title="Delete"
          onClick={() => setConfirming(true)}
          className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-md bg-bg/80 text-fg-2 opacity-0 transition-opacity hover:bg-red-600 hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Trash2 size={15} aria-hidden />
        </button>
      )}
    </li>
  );
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

  const handleDeleteRecent = useCallback(async (projectId: string) => {
    await deleteRecentProject(projectId);
    setRecents((current) => current.filter((entry) => entry.projectId !== projectId));
  }, []);

  const handleStartProject = useCallback(() => {
    setDesktopPage("edit");
    startNewProject();
  }, [setDesktopPage]);

  return (
    <div className="h-full overflow-y-auto bg-bg text-fg">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-8 py-12">
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
          {loadingRecents ? (
            <Text type="supporting" display="block" className="mt-3">
              Loading recent projects...
            </Text>
          ) : recents.length === 0 ? (
            <Text type="supporting" display="block" className="mt-3">
              No recent projects yet. Start a new project above.
            </Text>
          ) : (
            <ul className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {recents.map((entry) => (
                <RecentProjectCard
                  key={entry.id}
                  entry={entry}
                  isOpening={openingId === entry.id}
                  onOpen={() => void handleOpenRecent(entry.id)}
                  onDelete={() => void handleDeleteRecent(entry.projectId)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
