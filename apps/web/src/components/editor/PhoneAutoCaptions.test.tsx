import "../../test/install-local-storage-mock";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const transcribeClip = vi.fn(async () => [{ text: "um so that was funny", startTime: 0, endTime: 2, confidence: 1 }]);
vi.mock("./inspector/use-caption-transcriber", () => ({
  useCaptionTranscriber: () => ({ progress: 0, progressMessage: "", selectedModel: "fast", transcribeClip }),
}));
const state = vi.hoisted(() => ({
  project: {
    settings: { width: 1080, height: 1920 },
    mediaLibrary: { items: [{ id: "m1", type: "video", name: "Clip.mp4" }] },
    timeline: { tracks: [{ id: "t1", muted: false, clips: [{ id: "c1", mediaId: "m1", trackId: "t1", startTime: 0, duration: 2 }] }] },
  },
  addSubtitle: vi.fn(async () => undefined),
}));
vi.mock("../../stores/project-store", () => {
  const useProjectStore = (selector: (s: typeof state) => unknown) => selector(state);
  useProjectStore.getState = () => state;
  return { useProjectStore };
});

import { PhoneAutoCaptions } from "./PhoneAutoCaptions";

describe("PhoneAutoCaptions", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("generates from video and audio by default, and only offers Audio when there is an audio clip", () => {
    render(<PhoneAutoCaptions onClose={() => {}} />);
    expect(screen.getByRole("button", { name: /Generate from/ })).toHaveTextContent("Video & audio");
    fireEvent.click(screen.getByRole("button", { name: /Generate from/ }));
    expect(screen.getByRole("radio", { name: "Video & audio" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Video" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: "Audio" })).toBeDisabled();
  });

  it("captions the chosen source: both, just the audio, or just the video", async () => {
    const voice = { id: "c2", mediaId: "m2", trackId: "t2", startTime: 3, duration: 2 };
    const music = { id: "c3", mediaId: "m3", trackId: "t3", startTime: 0, duration: 9 };
    const linked = { id: "c4", mediaId: "m1", trackId: "t4", startTime: 0, duration: 2 };
    const saved = structuredClone(state.project);
    state.project.mediaLibrary.items.push({ id: "m2", type: "audio", name: "Voice.m4a" }, { id: "m3", type: "audio", name: "Song.mp3" });
    state.project.timeline.tracks.push(
      { id: "t2", muted: false, clips: [voice] },
      { id: "t3", muted: true, clips: [music] },
      { id: "t4", muted: false, clips: [linked] },
    );
    const run = async (choice: string | null) => {
      transcribeClip.mockClear();
      const onClose = vi.fn();
      render(<PhoneAutoCaptions onClose={onClose} />);
      if (choice) {
        fireEvent.click(screen.getByRole("button", { name: /Generate from/ }));
        fireEvent.click(screen.getByRole("radio", { name: choice }));
        fireEvent.click(screen.getByRole("button", { name: "Done" }));
      }
      fireEvent.click(screen.getByRole("button", { name: "Generate" }));
      await waitFor(() => expect(onClose).toHaveBeenCalled());
      cleanup();
      return (transcribeClip.mock.calls as unknown as [{ id: string }][]).map(([clip]) => clip.id);
    };
    try {
      // The muted song is skipped, and the video's linked audio is the same speech as the video.
      expect(await run(null)).toEqual(["c1", "c2"]);
      expect(await run("Audio")).toEqual(["c2"]);
      expect(await run("Video")).toEqual(["c1"]);
    } finally {
      state.project = saved;
    }
  });

  it("opens every template in a two-column sheet", () => {
    render(<PhoneAutoCaptions onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Templates/ }));
    expect(screen.getByRole("radiogroup", { name: "All caption templates" })).toHaveClass("grid-cols-2");
  });

  it("generates captions with filler words removed and emojis added, then closes", async () => {
    const onClose = vi.fn();
    render(<PhoneAutoCaptions onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Advanced options" }));
    fireEvent.click(screen.getByRole("switch", { name: "AI emojis" }));
    fireEvent.click(screen.getByRole("switch", { name: "Identify filler words" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(transcribeClip).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }), expect.anything(), { language: undefined, task: "transcribe" });
    expect(state.addSubtitle).toHaveBeenCalledWith(expect.objectContaining({ text: "so that was funny 😂" }), expect.anything(), expect.anything());
  });
});
