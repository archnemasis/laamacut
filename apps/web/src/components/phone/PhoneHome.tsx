import { useCallback, useEffect, useState } from "react";
import { Film, Plus, Settings, Trash2 } from "@/icons/lucide-compat";
import { OpenReelMark } from "../../desktop/brand/OpenReelMark";
import {
  deleteRecentProject,
  listRecentProjects,
  openRecentProject,
  startNewProject,
  type RecentEntry,
} from "../../desktop/start/desktop-project-actions";
import { requestPhoneMediaPicker } from "../../services/phone-media";
import { useRouter } from "../../hooks/use-router";
import { useSettingsStore } from "../../stores/settings-store";
import { SettingsDialog } from "../editor/settings/SettingsDialog";

const formatSaved = (savedAt: number): string =>
  new Date(savedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * CapCut-style phone home: a big New project button, then your projects.
 * New project goes straight to the media picker.
 */
export function PhoneHome() {
  const { navigate } = useRouter();
  const [projects, setProjects] = useState<RecentEntry[] | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listRecentProjects()
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);
  useEffect(refresh, [refresh]);

  const newProject = () => {
    startNewProject();
    requestPhoneMediaPicker();
    navigate("editor");
  };

  const open = async (entry: RecentEntry) => {
    if (await openRecentProject(entry.id)) navigate("editor");
  };

  const remove = async (entry: RecentEntry) => {
    setConfirming(null);
    await deleteRecentProject(entry.projectId);
    setProjects((prev) => prev?.filter((p) => p.projectId !== entry.projectId) ?? null);
  };

  return (
    <div className="flex h-full w-full flex-col bg-bg text-fg">
      <header className="flex h-14 shrink-0 items-center gap-2 px-4">
        <OpenReelMark size={22} className="text-accent" />
        <span className="text-[18px] font-bold tracking-tight">Laamacut</span>
        <button
          type="button"
          aria-label="Settings"
          onClick={() => useSettingsStore.getState().openSettings()}
          className="ml-auto grid h-10 w-10 place-items-center rounded-full text-fg-2"
        >
          <Settings size={22} aria-hidden />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
        <button
          type="button"
          onClick={newProject}
          className="mt-2 flex h-28 w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-br from-accent to-accent-strong text-white shadow-md active:scale-[0.99]"
        >
          <span className="grid h-11 w-11 place-items-center rounded-full bg-white/20">
            <Plus size={26} aria-hidden />
          </span>
          <span className="text-[19px] font-bold">New project</span>
        </button>

        <div className="mt-7 flex items-baseline justify-between">
          <h2 className="text-[17px] font-bold">Projects</h2>
          {projects && projects.length > 0 && <span className="text-[13px] text-fg-3">{projects.length}</span>}
        </div>

        {projects?.length === 0 && (
          <p className="mt-6 text-center text-[13px] text-fg-3">Your projects show up here. Tap New project to start.</p>
        )}

        <ul className="mt-3 space-y-3">
          {projects?.map((entry) => (
            <li key={entry.projectId} className="flex items-center gap-3">
              <button
                type="button"
                aria-label={`Open ${entry.name}`}
                onClick={() => void open(entry)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="grid h-[72px] w-[72px] shrink-0 place-items-center overflow-hidden rounded-xl bg-bg-2">
                  {entry.preview?.image ? (
                    <img src={entry.preview.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Film size={24} className="text-fg-3" aria-hidden />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold">{entry.name}</span>
                  <span className="mt-0.5 block text-[12px] text-fg-3">{formatSaved(entry.savedAt)}</span>
                </span>
              </button>
              {confirming === entry.projectId ? (
                <span className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => setConfirming(null)} className="rounded-lg bg-bg-2 px-3 py-2 text-[13px]">
                    Cancel
                  </button>
                  <button type="button" onClick={() => void remove(entry)} className="rounded-lg bg-red-600 px-3 py-2 text-[13px] font-semibold text-white">
                    Delete
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  aria-label={`Delete ${entry.name}`}
                  onClick={() => setConfirming(entry.projectId)}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-fg-3"
                >
                  <Trash2 size={20} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
      <SettingsDialog />
    </div>
  );
}
