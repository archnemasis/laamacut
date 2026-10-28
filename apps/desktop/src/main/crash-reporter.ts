import { app } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Crash reports stay on this computer: they're appended to crash.log in the
 * app's logs folder and never uploaded. Someone reporting a bug can attach it.
 */
const LOG_NAME = "crash.log";
/** Past this size the log starts again, so it can't grow forever. */
const MAX_LOG_BYTES = 2 * 1024 * 1024;

export interface CrashReportInput {
  type: string;
  source: string;
  message: string;
  stack?: string;
  context?: unknown;
}

function appVersionSafe(): string {
  try {
    return app.getVersion();
  } catch {
    return "unknown";
  }
}

export function describeError(value: unknown): { message: string; stack?: string } {
  if (value instanceof Error) {
    return { message: value.message || value.name || "Error", stack: value.stack };
  }
  if (typeof value === "object" && value !== null) {
    const maybe = value as { message?: unknown; stack?: unknown };
    if (typeof maybe.message === "string") {
      return {
        message: maybe.message,
        stack: typeof maybe.stack === "string" ? maybe.stack : undefined,
      };
    }
    try {
      return { message: JSON.stringify(value) };
    } catch {
      return { message: String(value) };
    }
  }
  return { message: String(value) };
}

function crashLogPath(): string {
  return path.join(app.getPath("logs"), LOG_NAME);
}

function write(report: CrashReportInput): void {
  try {
    const entry = {
      ...report,
      message: report.message?.slice(0, 8000) ?? "unknown",
      stack: report.stack?.slice(0, 16000),
      appVersion: appVersionSafe(),
      platform: process.platform,
      arch: process.arch,
      osVersion: os.release(),
      electronVersion: process.versions.electron,
      timestamp: new Date().toISOString(),
    };
    const file = crashLogPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file) && fs.statSync(file).size > MAX_LOG_BYTES) fs.rmSync(file);
    fs.appendFileSync(file, JSON.stringify(entry) + "\n");
  } catch {
    // The reporter must never throw — a failed report cannot escalate a crash.
  }
}

export function reportError(report: CrashReportInput): void {
  write(report);
}

export function initCrashReporter(): void {
  process.on("uncaughtException", (error) => {
    console.error("[main] uncaughtException:", error);
    reportError({ type: "uncaughtException", source: "main", ...describeError(error) });
  });
  process.on("unhandledRejection", (reason) => {
    console.error("[main] unhandledRejection:", reason);
    reportError({ type: "unhandledRejection", source: "main", ...describeError(reason) });
  });
  app.on("render-process-gone", (_event, _webContents, details) => {
    reportError({
      type: "render-process-gone",
      source: "renderer",
      message: `render process gone: ${details.reason} (exitCode ${details.exitCode})`,
      context: details,
    });
  });
  app.on("child-process-gone", (_event, details) => {
    reportError({
      type: "child-process-gone",
      source: details.type ?? "child",
      message: `child process gone: ${details.reason} (exitCode ${details.exitCode ?? "?"})`,
      context: details,
    });
  });
}
