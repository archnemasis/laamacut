import "../../test/install-local-storage-mock";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const voice = vi.hoisted(() => ({
  key: null as string | null,
  speak: vi.fn(async () => new Blob(["mp3"], { type: "audio/mpeg" })),
}));
vi.mock("../../services/phone-voice", async (original) => ({
  ...(await original<typeof import("../../services/phone-voice")>()),
  loadVoiceKey: vi.fn(async () => voice.key),
  saveVoiceKey: vi.fn(async (key: string) => { voice.key = key; }),
  forgetVoiceKey: vi.fn(async () => { voice.key = null; }),
  speak: voice.speak,
}));
const state = vi.hoisted(() => ({
  importMedia: vi.fn(async () => ({ success: true, actionId: "media-1" })),
  addClipToNewTrack: vi.fn(async () => undefined),
}));
vi.mock("../../stores/project-store", () => ({ useProjectStore: { getState: () => state } }));

import { PhoneTextToSpeech } from "./PhoneTextToSpeech";

describe("PhoneTextToSpeech", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    voice.key = null;
  });

  it("asks for a free ElevenLabs key first", async () => {
    render(<PhoneTextToSpeech onClose={() => {}} />);
    fireEvent.change(await screen.findByLabelText(/ElevenLabs API key/), { target: { value: " sk_abc " } });
    fireEvent.click(screen.getByRole("button", { name: "Save key" }));
    expect(await screen.findByLabelText("Text to speak")).toBeInTheDocument();
    expect(voice.key).toBe("sk_abc");
  });

  it("speaks in Adam by default and adds it to the timeline", async () => {
    voice.key = "sk_abc";
    const onClose = vi.fn();
    render(<PhoneTextToSpeech onClose={onClose} />);
    fireEvent.change(await screen.findByLabelText("Text to speak"), { target: { value: "This is Adam" } });
    expect(screen.getByRole("radio", { name: /Adam/ })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Add audio" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(voice.speak).toHaveBeenCalledWith("This is Adam", "pNInz6obpgDQGcFmaJgB", "sk_abc", expect.anything());
    const file = (state.importMedia.mock.calls[0] as unknown as [File])[0];
    expect(file.name).toBe("Adam - This is Adam.mp3");
    expect(state.addClipToNewTrack).toHaveBeenCalledWith("media-1", expect.any(Number));
  });
});
