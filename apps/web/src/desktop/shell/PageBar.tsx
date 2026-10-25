import type { JSX } from "react";
import { Film, House, Rocket, Settings, type LucideIcon } from "@/icons/lucide-compat";

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
      className={`flex w-16 flex-col items-center gap-0.5 text-[10px] font-medium transition-colors disabled:opacity-35 ${
        active ? "text-accent" : "text-fg-3 hover:text-fg"
      }`}
    >
      <IconComponent size={18} strokeWidth={1.6} aria-hidden />
      {label}
    </button>
  );
}

/**
 * DaVinci Resolve-style page bar along the bottom of the window: Home (the
 * project list) on the left, the Edit and Deliver pages in the middle, and
 * Settings on the right.
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
  return (
    <nav aria-label="Pages" className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-t border-border bg-bg-1 px-3">
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
      <div className="flex items-center gap-2">
        <PageTab label="Edit" icon={Film} active={hasProject} disabled={!hasProject} onClick={() => undefined} />
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
