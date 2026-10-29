import type { JSX } from "react";
import { AudioLines, Film, House, Images, Palette, Rocket, Settings, type LucideIcon } from "@/icons/lucide-compat";
import { useDesktopPage, type DesktopPage } from "./desktop-page";

function PageTab({
  label,
  icon: IconComponent,
  active = false,
  disabled = false,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  disabled?: boolean;
  onClick(): void;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      disabled={disabled}
      onClick={onClick}
      className={`relative flex h-full w-[72px] flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors disabled:opacity-35 ${
        active ? "text-fg" : "text-fg-3 hover:text-fg"
      }`}
    >
      <IconComponent size={20} strokeWidth={active ? 1.9 : 1.5} aria-hidden className={active ? "text-accent" : undefined} />
      {label}
      {active && <span aria-hidden className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full bg-accent" />}
    </button>
  );
}

const PAGES: { page: DesktopPage; label: string; icon: LucideIcon }[] = [
  { page: "media", label: "Media", icon: Images },
  { page: "edit", label: "Edit", icon: Film },
  { page: "color", label: "Color", icon: Palette },
  { page: "audio", label: "Audio", icon: AudioLines },
];

/**
 * DaVinci Resolve-style page bar along the bottom of the window: Home (the
 * project list) on the left, the Media, Edit, Color, Audio and Deliver pages
 * in the middle, and Settings on the right.
 */
export function PageBar({
  hasProject,
  onHome,
  onDeliver,
  onSettings,
}: {
  hasProject: boolean;
  onHome(): void;
  onDeliver(): void;
  onSettings(): void;
}): JSX.Element {
  const page = useDesktopPage((s) => s.page);
  const setPage = useDesktopPage((s) => s.setPage);
  return (
    <nav aria-label="Pages" className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-t border-border bg-bg-1 px-3">
      <div>
        <button
          type="button"
          aria-label="Home"
          title="Home: your projects"
          aria-current={hasProject ? undefined : "page"}
          onClick={onHome}
          className={`grid h-8 w-8 place-items-center rounded transition-colors hover:bg-hover ${hasProject ? "text-fg-3 hover:text-fg" : "text-accent"}`}
        >
          <House size={18} strokeWidth={1.6} aria-hidden />
        </button>
      </div>
      <div className="flex h-full items-stretch gap-1">
        {PAGES.map((tab) => (
          <PageTab
            key={tab.page}
            label={tab.label}
            icon={tab.icon}
            active={hasProject && page === tab.page}
            disabled={!hasProject}
            onClick={() => setPage(tab.page)}
          />
        ))}
        <PageTab label="Deliver" icon={Rocket} disabled={!hasProject} onClick={onDeliver} />
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          aria-label="Settings"
          title="Settings"
          onClick={onSettings}
          className="grid h-8 w-8 place-items-center rounded text-fg-3 transition-colors hover:bg-hover hover:text-fg"
        >
          <Settings size={18} strokeWidth={1.6} aria-hidden />
        </button>
      </div>
    </nav>
  );
}
