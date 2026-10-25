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

  it("only offers Voiceover when there is an audio clip", () => {
    render(<PhoneAutoCaptions onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Generate from/ }));
    expect(screen.getByRole("radio", { name: "Voiceover" })).toBeDisabled();
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
