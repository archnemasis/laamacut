import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => {
  const state = {
    project: {
      mediaLibrary: { items: [] as Array<{ id: string; type: string; metadata: { width: number; height: number } }> },
      timeline: { tracks: [] as Array<{ id: string; type: string; clips: Array<{ mediaId: string; startTime: number; duration: number }> }> },
    },
    importMedia: vi.fn(),
    updateSettings: vi.fn(async () => ({ success: true })),
    addClip: vi.fn(),
    addClipToNewTrack: vi.fn(),
  };
  return state;
});
vi.mock("../stores/project-store", () => ({ useProjectStore: { getState: () => store } }));

import { addMediaFilesToTimeline, canvasForMedia, requestPhoneMediaPicker, takePhoneMediaPickerRequest } from "./phone-media";

const durations: Record<string, number> = { "a.mp4": 3, "b.png": 5 };

beforeEach(() => {
  vi.clearAllMocks();
  store.project.mediaLibrary.items = [];
  store.project.timeline.tracks = [];
  let n = 0;
  store.importMedia.mockImplementation(async (file: File) => {
    const id = `m${++n}`;
    const portrait = file.name.endsWith(".mp4");
    store.project.mediaLibrary.items.push({
      id,
      type: portrait ? "video" : "image",
      metadata: portrait ? { width: 1080, height: 1920 } : { width: 800, height: 800 },
    });
    durations[id] = durations[file.name];
    return { success: true, actionId: id };
  });
  store.addClipToNewTrack.mockImplementation(async (mediaId: string, startTime: number) => {
    store.project.timeline.tracks.push({ id: "t1", type: "video", clips: [{ mediaId, startTime, duration: durations[mediaId] }] });
    return { success: true };
  });
  store.addClip.mockImplementation(async (trackId: string, mediaId: string, startTime: number) => {
    store.project.timeline.tracks.find((t) => t.id === trackId)!.clips.push({ mediaId, startTime, duration: durations[mediaId] });
    return { success: true };
  });
});

describe("addMediaFilesToTimeline", () => {
  it("lays picked files end to end in order and takes the first picture's shape", async () => {
    const added = await addMediaFilesToTimeline([new File(["v"], "a.mp4"), new File(["p"], "b.png")]);

    expect(added).toBe(2);
    expect(store.updateSettings).toHaveBeenCalledWith({ width: 1080, height: 1920 });
    expect(store.addClipToNewTrack).toHaveBeenCalledWith("m1", 0);
    expect(store.addClip).toHaveBeenCalledWith("t1", "m2", 3);
  });

  it("appends to the end of an existing timeline without changing its shape", async () => {
    store.project.mediaLibrary.items.push({ id: "old", type: "video", metadata: { width: 1920, height: 1080 } });
    store.project.timeline.tracks.push({ id: "t1", type: "video", clips: [{ mediaId: "old", startTime: 0, duration: 4 }] });

    await addMediaFilesToTimeline([new File(["v"], "a.mp4")]);

    expect(store.updateSettings).not.toHaveBeenCalled();
    expect(store.addClip).toHaveBeenCalledWith("t1", "m1", 4);
  });
});

describe("phone picker request", () => {
  it("is taken once", () => {
    requestPhoneMediaPicker();
    expect(takePhoneMediaPickerRequest()).toBe(true);
    expect(takePhoneMediaPickerRequest()).toBe(false);
  });
});

describe("canvasForMedia", () => {
  it("scales to a 1080 short side with even sizes", () => {
    expect(canvasForMedia({ metadata: { width: 3840, height: 2160 } } as never)).toEqual({ width: 1920, height: 1080 });
    expect(canvasForMedia({ metadata: { width: 0, height: 0 } } as never)).toBeNull();
  });
});
