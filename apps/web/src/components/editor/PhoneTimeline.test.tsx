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
    textClips: [],
  },
  trimClip: vi.fn(async () => ({ success: true })),
  moveClip: vi.fn(async () => ({ success: true })),
  muteTrack: vi.fn(async () => ({ success: true })),
}));
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
    const onAddAudio = vi.fn();
    const onAddText = vi.fn();
    render(<PhoneTimeline onAddMedia={() => {}} onAddAudio={onAddAudio} onAddText={onAddText} />);

    fireEvent.click(screen.getByRole("button", { name: "Add audio" }));
    fireEvent.click(screen.getByRole("button", { name: "Add text" }));
    expect(onAddAudio).toHaveBeenCalled();
    expect(onAddText).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Mute clip audio" }));
    expect(state.muteTrack).toHaveBeenCalledWith("t1", true);
  });

  it("selects a clip on tap and shows trim handles", () => {
    render(<PhoneTimeline onAddMedia={() => {}} onAddAudio={() => {}} onAddText={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Select Beach.mp4" }));
    expect(useUIStore.getState().selectedItems).toEqual([{ type: "clip", id: "c1", trackId: "t1" }]);
    expect(screen.getByRole("slider", { name: "Trim start" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Trim end" })).toBeInTheDocument();
  });
});
