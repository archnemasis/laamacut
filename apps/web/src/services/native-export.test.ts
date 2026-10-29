import { describe, expect, it, vi } from "vitest";
import type { Clip, MediaItem, Project, Track } from "@openreel/core";

const originals: Record<string, string> = {};
vi.mock("./gallery-originals", () => ({ galleryOriginalUri: (id: string) => originals[id] }));
vi.mock("./project-fonts", () => ({ ensureProjectFonts: async () => undefined }));
vi.mock("./phone-media", () => ({
  findMainTrack: (project: Project) => project.timeline.tracks.find((t) => t.clips.length > 0),
}));

import { planNativeExport } from "./native-export";

const transform = { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 }, opacity: 1, fitMode: "contain" as const };

function clip(id: string, mediaId: string, startTime: number, duration: number, extra: Partial<Clip> = {}): Clip {
  return {
    id, mediaId, trackId: "t", startTime, duration, inPoint: 1, outPoint: 1 + duration,
    effects: [], audioEffects: [], transform, volume: 1, keyframes: [], ...extra,
  };
}

function media(id: string, type: MediaItem["type"]): MediaItem {
  return { id, name: `${id}.bin`, type, blob: new Blob(["x"], { type: type === "image" ? "image/png" : "audio/mpeg" }), metadata: { frameRate: 30 } } as unknown as MediaItem;
}

function track(id: string, clips: Clip[], extra: Partial<Track> = {}): Track {
  return { id, type: "video", name: id, clips, transitions: [], locked: false, hidden: false, muted: false, solo: false, ...extra };
}

function project(tracks: Track[], items: MediaItem[], extra: Partial<Project> = {}): Project {
  return {
    id: "p", name: "p", createdAt: 0, modifiedAt: 0,
    settings: { width: 1080, height: 1920, frameRate: 30, sampleRate: 48000, channels: 2 },
    mediaLibrary: { items },
    timeline: { tracks, subtitles: [], duration: 0, markers: [] },
    ...extra,
  } as Project;
}

describe("planNativeExport", () => {
  originals.v1 = "content://media/1";
  originals.v2 = "content://media/2";

  it("plans gallery videos and photos end to end with trims, speed and volume", () => {
    const plan = planNativeExport(
      project(
        [
          track("main", [clip("a", "v1", 0, 2, { speed: 2, volume: 0.5 }), clip("b", "img", 2, 3), clip("c", "v2", 5, 1)]),
          track("music", [clip("m", "song", 1, 5)]),
        ],
        [media("v1", "video"), media("v2", "video"), media("img", "image"), media("song", "audio")],
      ),
    );
    if ("reason" in plan) throw new Error(plan.reason);
    expect(plan.duration).toBe(6);
    expect(plan.main[0]).toMatchObject({ uri: "content://media/1", inUs: 1_000_000, outUs: 5_000_000, durationUs: 2_000_000, speed: 2, volume: 0.5 });
    expect(plan.main[1]).toMatchObject({ kind: "image", durationUs: 3_000_000, mime: "image/png" });
    // Music starts after a 1s gap.
    expect(plan.audio[0][0]).toMatchObject({ gapBeforeUs: 1_000_000, durationUs: 5_000_000 });
    expect(plan.pending.map((p) => p.media.id)).toEqual(["img", "song"]);
  });

  it("mutes the main track's sound when the track is muted", () => {
    const plan = planNativeExport(project([track("main", [clip("a", "v1", 0, 2)], { muted: true })], [media("v1", "video")]));
    if ("reason" in plan) throw new Error(plan.reason);
    expect(plan.main[0].volume).toBe(0);
  });

  it.each([
    ["a zoomed clip", [track("main", [clip("a", "v1", 0, 2, { transform: { ...transform, scale: { x: 1.5, y: 1.5 } } })])]],
    ["clip effects", [track("main", [clip("a", "v1", 0, 2, { effects: [{ id: "e", type: "blur", params: {}, enabled: true }] })])]],
    ["a gap", [track("main", [clip("a", "v1", 0, 2), clip("b", "v2", 3, 1)])]],
    ["a video overlay", [track("main", [clip("a", "v1", 0, 2)]), track("over", [clip("b", "v2", 0, 1)])]],
    ["a video not from the gallery", [track("main", [clip("a", "other", 0, 2)])]],
  ])("uses the web export for %s", (_name, tracks) => {
    const plan = planNativeExport(project(tracks, [media("v1", "video"), media("v2", "video"), media("other", "video")]));
    expect("reason" in plan).toBe(true);
  });

  it("uses the web export for animated text but keeps still text", () => {
    const text = { id: "x", trackId: "tt", startTime: 0, duration: 1, text: "Hi", style: {}, transform, keyframes: [] };
    const tracks = [track("main", [clip("a", "v1", 0, 2)])];
    const items = [media("v1", "video")];
    const still = planNativeExport(project(tracks, items, { textClips: [text] as never }));
    if ("reason" in still) throw new Error(still.reason);
    expect(still.texts).toHaveLength(1);
    const animated = planNativeExport(
      project(tracks, items, { textClips: [{ ...text, animation: { preset: "fade", params: {}, inDuration: 0.5, outDuration: 0 } }] as never }),
    );
    expect(animated).toEqual({ reason: "text animations" });
  });

  it("uses the web export when text or music runs past the end of the video", () => {
    const tracks = [track("main", [clip("a", "v1", 0, 2)])];
    const text = { id: "x", trackId: "tt", startTime: 1, duration: 1.5, text: "Hi", style: {}, transform, keyframes: [] };
    const longText = planNativeExport(project(tracks, [media("v1", "video")], { textClips: [text] as never }));
    expect(longText).toEqual({ reason: "layers past the end of the video" });
    const longMusic = planNativeExport(
      project([...tracks, track("music", [clip("m", "song", 0, 3)])], [media("v1", "video"), media("song", "audio")]),
    );
    expect(longMusic).toEqual({ reason: "layers past the end of the video" });
  });
});
