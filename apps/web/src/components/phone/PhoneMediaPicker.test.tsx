import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const addMediaFilesToTimeline = vi.hoisted(() => vi.fn(async (_files: File[]) => 2));
vi.mock("../../services/phone-media", () => ({ addMediaFilesToTimeline }));

import { PhoneMediaPicker } from "./PhoneMediaPicker";

const gallery = {
  access: vi.fn(async () => ({ access: "denied" as const })),
  requestAccess: vi.fn(async () => ({ access: "granted" as const })),
  list: vi.fn(async ({ kind }: { kind: string }) => ({
    items:
      kind === "video"
        ? [
            { uri: "content://v/1", name: "beach.mp4", mime: "video/mp4", size: 10, duration: 22 },
            { uri: "content://v/2", name: "party.mp4", mime: "video/mp4", size: 10, duration: 15 },
          ]
        : [{ uri: "content://p/1", name: "cat.jpg", mime: "image/jpeg", size: 5 }],
  })),
  thumbnail: vi.fn(async () => ({ data: "data:image/jpeg;base64,AAAA" })),
};

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", class {
    constructor(private cb: (entries: { isIntersecting: boolean }[]) => void) {}
    observe() { this.cb([{ isIntersecting: true }]); }
    disconnect() {}
  });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(new Blob([url]))));
  (window as unknown as { Capacitor: unknown }).Capacitor = {
    Plugins: { LaamacutGallery: gallery },
    convertFileSrc: (uri: string) => `https://localhost/_capacitor_content_/${uri}`,
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
});

describe("PhoneMediaPicker gallery", () => {
  it("asks for gallery access, lists videos with durations, and adds picks in tap order", async () => {
    const onClose = vi.fn();
    render(<PhoneMediaPicker onClose={onClose} />);

    expect(await screen.findByRole("button", { name: "Select beach.mp4" })).toBeInTheDocument();
    expect(gallery.requestAccess).toHaveBeenCalled();
    expect(screen.getByText("00:22")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select party.mp4" }));
    fireEvent.click(screen.getByRole("button", { name: "Select beach.mp4" }));
    expect(screen.getByRole("button", { name: "Deselect party.mp4" })).toHaveTextContent("1");

    fireEvent.click(screen.getByRole("tab", { name: "Photos" }));
    fireEvent.click(await screen.findByRole("button", { name: "Select cat.jpg" }));

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const files = addMediaFilesToTimeline.mock.calls[0][0];
    expect(files.map((f) => f.name)).toEqual(["party.mp4", "beach.mp4", "cat.jpg"]);
  });

  it("explains how to allow access when it is refused", async () => {
    gallery.requestAccess.mockResolvedValueOnce({ access: "denied" as never });
    render(<PhoneMediaPicker onClose={() => {}} />);
    expect(await screen.findByText("Allow access to your videos and photos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose videos" })).toBeInTheDocument();
  });
});
