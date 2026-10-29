import { app, BrowserWindow, ipcMain } from "electron";
import { autoUpdater } from "electron-updater";
import { CHANNELS } from "../shared/ipc-contract";

export type UpdaterStatus =
  | { state: "checking" }
  | { state: "available"; version: string }
  | { state: "none" }
  | { state: "downloading"; percent: number }
  | { state: "downloaded"; version: string }
  | { state: "error"; message: string };

export const UPDATE_FEED = { provider: "github", owner: "archnemasis", repo: "laamacut" } as const;

let lastStatus: UpdaterStatus | null = null;

function broadcast(status: UpdaterStatus): void {
  lastStatus = status;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(CHANNELS.updaterStatus, status);
    }
  }
}

function runCheckWhenLoaded(win: BrowserWindow, run: () => void): void {
  if (win.webContents.isLoading()) {
    win.webContents.once("did-finish-load", run);
  } else {
    run();
  }
}

// Wires electron-updater to check GitHub releases on launch, download in the
// background, and install on the next quit. The quit path runs the unsaved-
// changes guard first (autoInstallOnAppQuit fires on the normal quit sequence),
// so updates never bypass the save prompt. No-op in dev.
export function initAutoUpdater(): void {
  if (!app.isPackaged) return;

  // Laamacut's releases on GitHub. Each one carries the installer and the
  // latest.yml electron-builder writes next to it.
  autoUpdater.setFeedURL(UPDATE_FEED);

  // Notify → (user-consented) download → install on quit. The download is not
  // automatic; the renderer triggers it after telling the user an update
  // exists. The downloaded update installs on the next quit, which runs the
  // unsaved-changes guard first, so installing never bypasses the save prompt.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  // Every release is published as GitHub's Latest, even though the versions
  // are 1.0.0-alpha.N, so follow Latest rather than the newest pre-release.
  autoUpdater.allowPrerelease = false;

  // Renderer-driven actions: start the download on user consent, and "install"
  // by quitting through the normal (guarded) path so the save prompt still runs.
  // Installing on an ordinary quit is silent and leaves Laamacut closed, so
  // after Restart & Install the installer is told to open it again.
  let relaunchAfterInstall = false;
  app.on("quit", () => {
    if (relaunchAfterInstall) autoUpdater.quitAndInstall(true, true);
  });
  ipcMain.handle(CHANNELS.updaterDownload, async () => {
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      broadcast({
        state: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
  ipcMain.handle(CHANNELS.updaterInstall, () => {
    relaunchAfterInstall = true;
    app.quit();
  });

  autoUpdater.on("checking-for-update", () => broadcast({ state: "checking" }));
  autoUpdater.on("update-available", (info) =>
    broadcast({ state: "available", version: info.version }),
  );
  autoUpdater.on("update-not-available", () => broadcast({ state: "none" }));
  autoUpdater.on("download-progress", (progress) =>
    broadcast({ state: "downloading", percent: Math.round(progress.percent) }),
  );
  autoUpdater.on("update-downloaded", (info) =>
    broadcast({ state: "downloaded", version: info.version }),
  );
  autoUpdater.on("error", (error) =>
    broadcast({
      state: "error",
      message: error instanceof Error ? error.message : String(error),
    }),
  );

  // Replay the latest status to any window once it has loaded, so a
  // late-mounting renderer still learns about an already-downloaded update.
  app.on("browser-window-created", (_event, win) => {
    win.webContents.once("did-finish-load", () => {
      if (lastStatus && !win.isDestroyed()) {
        win.webContents.send(CHANNELS.updaterStatus, lastStatus);
      }
    });
  });

  // Defer the first check until a renderer has loaded so its status listener is
  // registered before events fire. checkForUpdates rejects on unsupported
  // targets (unsigned macOS, a .deb install) — surface it but never crash.
  const check = () =>
    autoUpdater.checkForUpdates().catch((error) => {
      console.error("[updater] check failed:", error);
    });
  const [firstWindow] = BrowserWindow.getAllWindows();
  if (firstWindow) {
    runCheckWhenLoaded(firstWindow, check);
  } else {
    app.once("browser-window-created", (_event, win) =>
      runCheckWhenLoaded(win, check),
    );
  }
}
