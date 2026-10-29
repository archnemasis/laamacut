import { describe, it, expect } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import { PathGrants, pathGrants, requireProjectPath, tempFilePath } from "../src/main/ipc/fs";

describe("PathGrants", () => {
  it("only allows paths that were granted", () => {
    const grants = new PathGrants();
    const picked = path.join(tmpdir(), "picked.mp4");
    expect(grants.has(picked)).toBe(false);
    expect(() => grants.require(picked)).toThrow(/not chosen/);
    grants.grant(picked);
    expect(grants.require(picked)).toBe(picked);
  });

  it("matches the same file written differently", () => {
    const grants = new PathGrants();
    grants.grant(path.join(tmpdir(), "a", "clip.mp4"));
    expect(grants.has(path.join(tmpdir(), "a", "b", "..", "clip.mp4"))).toBe(true);
  });

  it("rejects relative paths and non-strings", () => {
    const grants = new PathGrants();
    grants.grant("clip.mp4");
    expect(grants.has("clip.mp4")).toBe(false);
    expect(grants.has(undefined as unknown as string)).toBe(false);
  });

  it("grants the temp files it hands out", async () => {
    const p = await tempFilePath({ ext: "mp4" });
    expect(pathGrants.has(p)).toBe(true);
  });
});

describe("requireProjectPath", () => {
  it("allows project files so Recent projects reopen after a restart", () => {
    const project = path.join(tmpdir(), "My video.oreel");
    expect(requireProjectPath(project)).toBe(project);
  });

  it("rejects other files the user never picked", () => {
    expect(() => requireProjectPath(path.join(tmpdir(), "secrets.txt"))).toThrow();
    expect(() => requireProjectPath("relative.oreel")).toThrow();
  });
});
