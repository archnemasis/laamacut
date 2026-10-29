// Builds the web app for the desktop shell. Setting OPENREEL_DESKTOP inline
// (`OPENREEL_DESKTOP=1 pnpm ...`) does not work in Windows cmd.exe, so the
// variable is set here instead.
import { spawnSync } from "node:child_process";

const result = spawnSync("pnpm", ["--filter", "@openreel/web", "build"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, OPENREEL_DESKTOP: "1" },
});
process.exit(result.status ?? 1);
