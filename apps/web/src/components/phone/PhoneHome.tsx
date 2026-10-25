import { useCallback, useEffect, useState } from "react";
import { Film, Plus, Scissors, Trash2, User, type LucideIcon } from "@/icons/lucide-compat";
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
import { GeneralPanel } from "../editor/settings/GeneralPanel";
import "../editor/phone-editor.css";

type HomeTab = "edit" | "me";

const formatSaved = (savedAt: number): string =>
  new Date(savedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function EditTab() {
  const { navigate } = useRouter();
  const [projects, setProjects] = useState<RecentEntry[] | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listRecentProjects()
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);
  useEffect(refresh, [refresh]);

  const newVideo = () => {
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
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 px-4">
        <OpenReelMark size={22} className="text-accent" />
        <span className="text-[18px] font-bold tracking-tight">Laamacut</span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <button
          type="button"
          onClick={newVideo}
          className="mt-1 flex h-36 w-full flex-col items-center justify-center gap-3 rounded-2xl bg-bg-2 active:scale-[0.99]"
        >
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-fg text-bg">
            <Plus size={28} strokeWidth={2.5} aria-hidden />
          </span>
          <span className="text-[19px] font-bold">New video</span>
        </button>

        {projects?.length === 0 && (
          <p className="mt-8 text-center text-[13px] text-fg-3">Your videos show up here. Tap New video to start.</p>
        )}

        <ul className="mt-5 space-y-3">
          {projects?.map((entry) => (
            <li key={entry.projectId} className="flex items-center gap-3">
              <button
                type="button"
                aria-label={`Open ${entry.name}`}
                onClick={() => void open(entry)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="grid h-[76px] w-[76px] shrink-0 place-items-center overflow-hidden rounded-xl bg-bg-2">
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
    </>
  );
}

function MeTab() {
  return (
    <>
      <header className="flex h-14 shrink-0 items-center px-4">
        <span className="text-[20px] font-bold">Me</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <div className="mb-5 flex items-center gap-3 rounded-2xl bg-bg-2 p-4">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-bg-3">
            <OpenReelMark size={26} className="text-accent" />
          </span>
          <span>
            <span className="block text-[16px] font-semibold">Laamacut</span>
            <span className="block text-[12px] text-fg-3">Everything stays on your phone</span>
          </span>
        </div>
        <GeneralPanel showProjectSettings={false} />
      </div>
    </>
  );
}

const TABS: { id: HomeTab; label: string; icon: LucideIcon }[] = [
  { id: "edit", label: "Edit", icon: Scissors },
  { id: "me", label: "Me", icon: User },
];

/**
 * CapCut-style phone home: New video with your videos listed underneath on
 * the Edit tab, and preferences on the Me tab.
 */
export function PhoneHome() {
  const [tab, setTab] = useState<HomeTab>("edit");
  return (
    <div className="phone-home flex h-full w-full flex-col bg-bg text-fg">
      {tab === "edit" ? <EditTab /> : <MeTab />}
      <nav aria-label="Home" className="flex h-16 shrink-0 border-t border-border bg-bg">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setTab(id)}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[12px] font-medium ${
              tab === id ? "text-fg" : "text-fg-muted"
            }`}
          >
            <Icon size={24} strokeWidth={tab === id ? 2.2 : 1.7} aria-hidden />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
