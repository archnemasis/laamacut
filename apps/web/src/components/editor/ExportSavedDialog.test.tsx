import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExportSavedDialog } from "./ExportSavedDialog";

describe("ExportSavedDialog", () => {
  afterEach(cleanup);

  it("plays the saved video and opens its folder", () => {
    const onReveal = vi.fn();
    const onClose = vi.fn();
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    render(<ExportSavedDialog fileName="My video.mp4" videoUrl="blob:video" aspect={16 / 9} onReveal={onReveal} onClose={onClose} />);

    expect(screen.getByRole("dialog", { name: "Video saved" })).toHaveTextContent("My video.mp4");
    fireEvent.click(screen.getByRole("button", { name: "Play video" }));
    expect(play).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Show in folder" }));
    expect(onReveal).toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("shows the cover without a player or folder button when there's no file", () => {
    render(<ExportSavedDialog fileName="My video.mp4" still="data:image/png;base64,x" aspect={1} onClose={() => undefined} />);
    expect(screen.queryByRole("button", { name: "Play video" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Show in folder" })).toBeNull();
  });
});
