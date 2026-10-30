import { describe, expect, it } from "vitest";
import type { Clip, MediaItem, Project, VideoExportSettings } from "@openreel/core";
import { planStreamCopy } from "./desktop-stream-copy";

const media = (id: string, duration = 10): MediaItem =>
  ({
    id,
    name: `${id}.mp4`,
    type: "video",
    blob: new Blob(["x"]),
    fileHandle: null,
    thumbnailUrl: null,
    waveformData: null,
    metadata: { duration, width: 1920, height: 1080, frameRate: 30, codec: "avc1", sampleRate: 48000, channels: 2, fileSize: 1 },
  }) as MediaItem;

const clip = (id: string, startTime: number, overrides: Partial<Clip> = {}): Clip =>
  ({
    id: `clip-${id}`,
    mediaId: id,
    trackId: "t1",
    startTime,
    duration: 10,
    inPoint: 0,
    outPoint: 10,
    effects: [],
    audioEffects: [],
    keyframes: [],
    volume: 1,
    transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 }, opacity: 1 },
    ...overrides,
  }) as Clip;

const project = (clips: Clip[], extra: Partial<Project> = {}): Project =>
  ({
    mediaLibrary: { items: [media("a"), media("b")] },
    timeline: {
      tracks: [{ id: "t1", clips, transitions: [], hidden: false, muted: false, locked: false, solo: false, name: "V1", type: "video" }],
      subtitles: [],
      markers: [],
      duration: 20,
    },
    ...extra,
  }) as unknown as Project;

const settings = { codec: "h264", format: "mp4", width: 1920, height: 1080, frameRate: 30 } as VideoExportSettings;

describe("planStreamCopy", () => {
  it("copies whole, untouched clips back to back", () => {
    const plan = planStreamCopy(project([clip("a", 0), clip("b", 10)]), settings);
    expect(plan?.map((p) => p.media.id)).toEqual(["a", "b"]);
  });

  it("renders anything copying can't reproduce exactly", () => {
    expect(planStreamCopy(project([clip("a", 0, { inPoint: 2, duration: 8 })]), settings)).toBeNull();
    expect(planStreamCopy(project([clip("a", 0, { duration: 6 })]), settings)).toBeNull();
    expect(planStreamCopy(project([clip("a", 0), clip("b", 12)]), settings)).toBeNull();
    expect(planStreamCopy(project([clip("a", 0, { volume: 0.5 })]), settings)).toBeNull();
    expect(planStreamCopy(project([clip("a", 0)], { textClips: [{}] } as Partial<Project>), settings)).toBeNull();
    expect(planStreamCopy(project([clip("a", 0)]), { ...settings, width: 1280, height: 720 })).toBeNull();
    expect(planStreamCopy(project([clip("a", 0)]), { ...settings, codec: "prores" } as VideoExportSettings)).toBeNull();
  });
});
