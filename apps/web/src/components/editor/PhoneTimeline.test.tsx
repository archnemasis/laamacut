import "../../test/install-local-storage-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useUIStore } from "../../stores/ui-store";

const state = vi.hoisted(() => ({
  project: {
    mediaLibrary: { items: [{ id: "m1", type: "video", name: "Beach.mp4", metadata: { duration: 10 } }] },
    timeline: {
      duration: 5,
      tracks: [{ id: "t1", type: "video", muted: false, clips: [{ id: "c1", mediaId: "m1", trackId: "t1", startTime: 0, duration: 5, inPoint: 0, outPoint: 5 }] }],
    },
    textClips: [{ id: "x1", text: "Hello", startTime: 1, duration: 2 }],
  },
  updateOverlayClipTiming: vi.fn(),
  trimClip: vi.fn(async () => ({ success: true })),
  moveClip: vi.fn(async () => ({ success: true })),
  muteTrack: vi.fn(async () => ({ success: true })),
}));
vi.mock("../../services/phone-media", () => ({ reorderTrackClips: vi.fn(async () => undefined) }));
vi.mock("../../services/filmstrip", () => ({ ensureFilmstrip: () => undefined }));
vi.mock("../../stores/project-store", () => {
  const useProjectStore = (selector: (s: typeof state) => unknown) => selector(state);
  useProjectStore.getState = () => state;
  return { useProjectStore };
});

import { PhoneTimeline } from "./PhoneTimeline";

describe("PhoneTimeline", () => {
  beforeEach(() => useUIStore.setState({ selectedItems: [] }));
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the clip strip with Add audio and Add text lanes like CapCut", () => {
    const texts = state.project.textClips;
    state.project.textClips = [];
    const onAddAudio = vi.fn();
    const onAddText = vi.fn();
    render(<PhoneTimeline onAddMedia={() => {}} onAddAudio={onAddAudio} onAddText={onAddText} />);

    fireEvent.click(screen.getByRole("button", { name: "Add audio" }));
    fireEvent.click(screen.getByRole("button", { name: "Add text" }));
    expect(onAddAudio).toHaveBeenCalled();
    expect(onAddText).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Mute clip audio" }));
    expect(state.muteTrack).toHaveBeenCalledWith("t1", true);
    state.project.textClips = texts;
  });

  it("selects a clip on tap and shows trim handles", () => {
    render(<PhoneTimeline onAddMedia={() => {}} onAddAudio={() => {}} onAddText={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Select Beach.mp4" }));
    expect(useUIStore.getState().selectedItems).toEqual([{ type: "clip", id: "c1", trackId: "t1" }]);
    expect(screen.getByRole("slider", { name: "Trim start" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Trim end" })).toBeInTheDocument();
  });

  const drag = (handle: HTMLElement, dx: number) => {
    handle.setPointerCapture = () => {};
    handle.dispatchEvent(new MouseEvent("pointerdown", { clientX: 100, bubbles: true }));
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 100 + dx }));
    window.dispatchEvent(new MouseEvent("pointerup", { clientX: 100 + dx }));
  };

  it("only stretches a video back out to the length of its file", () => {
    useUIStore.setState({ selectedItems: [{ type: "clip", id: "c1", trackId: "t1" }] });
    render(<PhoneTimeline onAddMedia={() => {}} onAddAudio={() => {}} onAddText={() => {}} />);
    drag(screen.getByRole("slider", { name: "Trim end" }), 56 * 20);
    expect(state.trimClip).toHaveBeenCalledWith("c1", undefined, 10);
  });

  it("snaps a trimmed end onto the end of the video", () => {
    useUIStore.setState({ selectedItems: [{ type: "text-clip", id: "x1" }] });
    render(<PhoneTimeline onAddMedia={() => {}} onAddAudio={() => {}} onAddText={() => {}} />);
    // The text ends at 3s; dragging to just short of 5s clicks onto the video's end.
    drag(screen.getByRole("slider", { name: "Trim end" }), 56 * 2 - 6);
    expect(state.updateOverlayClipTiming).toHaveBeenCalledWith("x1", { duration: 4 });
  });

  const hold = (block: HTMLElement, dx: number) => {
    vi.useFakeTimers();
    try {
      block.dispatchEvent(new MouseEvent("pointerdown", { clientX: 100, clientY: 10, bubbles: true }));
      vi.advanceTimersByTime(400);
      window.dispatchEvent(new MouseEvent("pointermove", { clientX: 100 + dx, clientY: 10 }));
      window.dispatchEvent(new MouseEvent("pointerup", { clientX: 100 + dx, clientY: 10 }));
    } finally {
      vi.useRealTimers();
    }
  };
  const textBlock = () => screen.getByRole("button", { name: /^Select Hello/ }).parentElement!;

  it("holds and slides text along the timeline", () => {
    render(<PhoneTimeline onAddMedia={() => {}} onAddAudio={() => {}} onAddText={() => {}} />);
    hold(textBlock(), 56);
    expect(state.updateOverlayClipTiming).toHaveBeenCalledWith("x1", { startTime: 2, duration: 2 });
    expect(useUIStore.getState().selectedItems).toEqual([{ type: "text-clip", id: "x1" }]);
  });

  it("snaps a slid block's end onto the end of the video", () => {
    render(<PhoneTimeline onAddMedia={() => {}} onAddAudio={() => {}} onAddText={() => {}} />);
    hold(textBlock(), 56 * 2 - 6);
    expect(state.updateOverlayClipTiming).toHaveBeenCalledWith("x1", { startTime: 3, duration: 2 });
  });

  it("slides audio with moveClip", () => {
    const saved = structuredClone(state.project);
    state.project.mediaLibrary.items.push({ id: "m2", type: "audio", name: "Song.mp3", metadata: { duration: 30 } });
    state.project.timeline.tracks.push({
      id: "t2", type: "audio", muted: false,
      clips: [{ id: "a1", mediaId: "m2", trackId: "t2", startTime: 0.5, duration: 1, inPoint: 0, outPoint: 1 }],
    });
    render(<PhoneTimeline onAddMedia={() => {}} onAddAudio={() => {}} onAddText={() => {}} />);
    hold(screen.getByRole("button", { name: /^Select Song.mp3/ }).parentElement!, 56 * 2);
    expect(state.moveClip).toHaveBeenCalledWith("a1", 2.5);
    state.project = saved;
  });

  it("steps through a caption-heavy lane with Previous/Next instead of dozens of buttons", () => {
    const saved = state.project.textClips;
    state.project.textClips = Array.from({ length: 10 }, (_, i) => ({ id: `cap${i}`, text: `Line ${i}`, startTime: i * 0.5, duration: 0.5 }));
    render(<PhoneTimeline onAddMedia={() => {}} onAddAudio={() => {}} onAddText={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Next caption" }));
    expect(useUIStore.getState().selectedItems).toEqual([{ type: "text-clip", id: "cap0" }]);
    fireEvent.click(screen.getByRole("button", { name: "Next caption" }));
    expect(useUIStore.getState().selectedItems).toEqual([{ type: "text-clip", id: "cap1" }]);
    // The bars themselves are hidden from screen readers until one is selected.
    expect(screen.queryByRole("button", { name: /^Select Line 5/ })).toBeNull();
    state.project.textClips = saved;
  });

  it("stretches text as far as you drag it", () => {
    useUIStore.setState({ selectedItems: [{ type: "text-clip", id: "x1" }] });
    render(<PhoneTimeline onAddMedia={() => {}} onAddAudio={() => {}} onAddText={() => {}} />);
    drag(screen.getByRole("slider", { name: "Trim end" }), 56 * 20);
    expect(state.updateOverlayClipTiming).toHaveBeenCalledWith("x1", { duration: 22 });
  });
});
