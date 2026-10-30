import { describe, expect, it } from "vitest";
import { phoneExportSettings, recommendedBitrate } from "./PhoneExportPanel";

describe("phoneExportSettings", () => {
  it("keeps the project's shape with the chosen resolution as the short side", () => {
    const settings = phoneExportSettings({ resolution: 720, frameRate: 60, bitrate: null, evenLoudness: false }, { width: 1080, height: 1920 });
    expect(settings).toMatchObject({ width: 720, height: 1280, frameRate: 60, keyframeInterval: 120 });
    expect(settings.bitrate).toBe(recommendedBitrate(720, 60) * 1000);
  });

  it("uses a chosen bitrate over the recommended one", () => {
    const settings = phoneExportSettings({ resolution: 2160, frameRate: 30, bitrate: 100, evenLoudness: false }, { width: 1920, height: 1080 });
    expect(settings).toMatchObject({ width: 3840, height: 2160, bitrate: 100000 });
    expect(settings.audioSettings.loudnessTarget).toBeUndefined();
  });

  it("asks for even loudness when switched on", () => {
    const settings = phoneExportSettings({ resolution: 1080, frameRate: 30, bitrate: null, evenLoudness: true }, { width: 1920, height: 1080 });
    expect(settings.audioSettings.loudnessTarget).toBe(-14);
  });
});
