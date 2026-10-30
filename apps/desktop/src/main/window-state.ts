import { app, screen, type BrowserWindow, type Rectangle } from "electron";
import { promises as fs, readFileSync } from "node:fs";
import path from "node:path";

/** Where and how big the editor window was when it last closed. */
export interface WindowState {
  bounds: Rectangle;
  maximized: boolean;
}

const MIN_VISIBLE = 120;

/**
 * The saved state, or null when there is none worth using: unreadable, too
 * small, or on a display that is no longer connected (it would open off-screen).
 */
export function usableWindowState(raw: unknown, workAreas: readonly Rectangle[]): WindowState | null {
  if (!raw || typeof raw !== "object") return null;
  const { bounds, maximized } = raw as Partial<WindowState>;
  if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return null;
  if (bounds.width < 400 || bounds.height < 300) return null;
  const onScreen = workAreas.some((area) =>
    Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x) >= MIN_VISIBLE &&
    Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y) >= MIN_VISIBLE,
  );
  return onScreen ? { bounds, maximized: maximized === true } : null;
}

const stateFile = () => path.join(app.getPath("userData"), "window-state.json");

export function loadWindowState(): WindowState | null {
  try {
    const raw: unknown = JSON.parse(readFileSync(stateFile(), "utf8"));
    return usableWindowState(raw, screen.getAllDisplays().map((display) => display.workArea));
  } catch {
    return null;
  }
}

/** Remembers the window's size and place each time it closes. */
export function trackWindowState(win: BrowserWindow): void {
  win.on("close", () => {
    const state: WindowState = { bounds: win.getNormalBounds(), maximized: win.isMaximized() };
    void fs.writeFile(stateFile(), JSON.stringify(state), "utf8").catch(() => undefined);
  });
}
