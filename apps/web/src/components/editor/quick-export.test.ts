import { describe, expect, it } from "vitest";
import {
  defaultQuickResolution,
  quickBitrateKbps,
  quickExportSize,
  quickResolutionOptions,
} from "./quick-export";

describe("quickExportSize", () => {
  it("sizes landscape projects by their height", () => {
    expect(quickExportSize(1920, 1080, 720)).toEqual({ width: 1280, height: 720 });
    expect(quickExportSize(1920, 1080, 2160)).toEqual({ width: 3840, height: 2160 });
  });

  it("sizes vertical projects by their width", () => {
    expect(quickExportSize(1080, 1920, 720)).toEqual({ width: 720, height: 1280 });
  });

  it("keeps dimensions even", () => {
    const { width, height } = quickExportSize(1080, 1350, 480);
    expect(width % 2).toBe(0);
    expect(height % 2).toBe(0);
  });
});

describe("defaultQuickResolution", () => {
  it("picks the largest resolution that doesn't upscale", () => {
    expect(defaultQuickResolution(1920, 1080)).toBe(1080);
    expect(defaultQuickResolution(3840, 2160)).toBe(2160);
    expect(defaultQuickResolution(1000, 1000)).toBe(720);
  });

  it("keeps tiny canvases at their own size instead of upscaling", () => {
    expect(defaultQuickResolution(320, 240)).toBe(240);
  });
});

describe("quickResolutionOptions", () => {
  it("adds the project's own size when it isn't a standard resolution", () => {
    const options = quickResolutionOptions(640, 360);
    expect(options[0]).toEqual({ value: 360, label: "Project (640×360)" });
    expect(options).toHaveLength(6);
  });

  it("doesn't duplicate a standard size", () => {
    expect(quickResolutionOptions(1920, 1080)).toHaveLength(5);
  });
});

describe("quickBitrateKbps", () => {
  it("scales with resolution, frame rate and level", () => {
    const recommended = quickBitrateKbps(1920, 1080, 30, "recommended");
    expect(recommended).toBe(7500);
    expect(quickBitrateKbps(1920, 1080, 30, "lower")).toBe(3700);
    expect(quickBitrateKbps(1920, 1080, 30, "higher")).toBe(14900);
    expect(quickBitrateKbps(1920, 1080, 120, "recommended")).toBe(29900);
  });

  it("stays within the encoder's limits", () => {
    expect(quickBitrateKbps(320, 240, 24, "lower")).toBe(1000);
    expect(quickBitrateKbps(3840, 2160, 120, "higher")).toBe(150000);
  });
});
