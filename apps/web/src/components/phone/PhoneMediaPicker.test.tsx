import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const addMediaFilesToTimeline = vi.hoisted(() =>
  vi.fn(async (files: File[], onImported?: (index: number, mediaId: string) => void) => {
    files.forEach((_, i) => onImported?.(i, `media-${i}`));
    return files.length;
  }),
);
const adopt = vi.hoisted(() => vi.fn());
vi.mock("../../stores/preview-proxy-store", () => ({ previewProxyCache: { adopt } }));
const projectState = vi.hoisted(() => ({
  project: { mediaLibrary: { items: [0, 1, 2].map((i) => ({ id: `media-${i}`, type: "video" })) as Array<Record<string, unknown>> } },
}));
vi.mock("../../stores/project-store", () => ({
  useProjectStore: {
    getState: () => projectState,
    setState: (next: { project: typeof projectState.project }) => {
      projectState.project = next.project;
    },
  },
}));
vi.mock("../../services/filmstrip-cache", () => ({ loadFilmstrip: (_key: string, make: () => Promise<unknown>) => make() }));
vi.mock("../../services/phone-media", async () => {
  const { create } = await import("zustand");
  return { addMediaFilesToTimeline, usePhoneImportStore: create(() => ({ loading: null })) };
});

import { PhoneMediaPicker } from "./PhoneMediaPicker";
import { GalleryFile } from "../../services/gallery-file";

const gallery = {
  access: vi.fn(async () => ({ access: "denied" as const })),
  requestAccess: vi.fn(async () => ({ access: "granted" as const })),
  requestMore: vi.fn(async () => ({ access: "limited" as const })),
  audioAccess: vi.fn(async () => ({ access: "denied" as const })),
  requestAudioAccess: vi.fn(async () => ({ access: "granted" as const })),
  list: vi.fn(async ({ kind }: { kind: string }) => ({
    items:
      kind === "audio"
        ? [{ uri: "content://a/1", name: "song.mp3", mime: "audio/mpeg", size: 7, duration: 180 }]
        : kind === "video"
        ? [
            { uri: "content://v/1", name: "beach.mp4", mime: "video/mp4", size: 10, duration: 22 },
            { uri: "content://v/2", name: "party.mp4", mime: "video/mp4", size: 10, duration: 15 },
          ]
        : [{ uri: "content://p/1", name: "cat.jpg", mime: "image/jpeg", size: 5 }],
  })),
  thumbnail: vi.fn(async () => ({ data: "data:image/jpeg;base64,AAAA" })),
  // A 4K phone video unless a test says otherwise: heavy enough for a preview copy.
  probe: vi.fn(async () => ({ width: 2160, height: 3840, fps: 30 })),
  compress: vi.fn(async ({ uri }: { uri: string }) => ({ path: `file:///cache/${uri.split("/").pop()}.mp4` })),
  discard: vi.fn(async () => undefined),
  frames: vi.fn(async () => ({ frames: [{ timestamp: 0.5, data: "data:image/jpeg;base64,BBBB" }] })),
};

beforeEach(() => {
  localStorage.removeItem("laamacut-phone-hd");
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

    expect(await screen.findByRole("checkbox", { name: /^beach.mp4/ })).toBeInTheDocument();
    expect(gallery.requestAccess).toHaveBeenCalled();
    expect(screen.getByText("00:22")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /^party.mp4/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /^beach.mp4/ }));
    expect(screen.getByRole("checkbox", { name: "party.mp4, 00:15, number 1" })).toBeChecked();

    fireEvent.click(screen.getByRole("tab", { name: "Photos" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: /^cat.jpg/ }));

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    // Straight back to the editor, which shows the loading state.
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(true));
    const files = addMediaFilesToTimeline.mock.calls[0][0];
    expect(files.map((f) => f.name)).toEqual(["party.mp4", "beach.mp4", "cat.jpg"]);

    // Videos aren't copied in: they read straight from the gallery. HD is off
    // by default, so heavy ones get 720p copies that take over the preview
    // once the phone has made them.
    expect(files.map((f) => f.type)).toEqual(["video/mp4", "video/mp4", "image/jpeg"]);
    expect(files[0]).toBeInstanceOf(GalleryFile);
    expect(files[0].size).toBe(10);
    const fetched = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(fetched.some((url) => url.endsWith("content://v/1"))).toBe(false);
    expect(gallery.compress).toHaveBeenCalledWith({ uri: "content://v/2", height: 720 });
    expect(gallery.compress).toHaveBeenCalledWith({ uri: "content://v/1", height: 720 });
    await waitFor(() => expect(adopt).toHaveBeenCalledTimes(2));
    expect(adopt).toHaveBeenCalledWith(expect.objectContaining({ id: "media-0" }), expect.any(Blob), "medium");
    // Copies stay on the phone so a reopened project gets them back.
    expect(gallery.discard).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem("laamacut-gallery-originals") ?? "{}")["media-0"]).toMatchObject({ uri: "content://v/2", copy: false });
    // The phone-decoded filmstrip is on the clip before it reaches the timeline.
    expect(projectState.project.mediaLibrary.items[0]).toMatchObject({ thumbnailUrl: "data:image/jpeg;base64,BBBB" });
  });

  it("makes no copy for videos phones already play smoothly", async () => {
    gallery.probe.mockResolvedValue({ width: 1080, height: 1920, fps: 30 });
    render(<PhoneMediaPicker onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /^beach.mp4/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(addMediaFilesToTimeline).toHaveBeenCalled());
    expect(gallery.compress).not.toHaveBeenCalled();
    gallery.probe.mockResolvedValue({ width: 2160, height: 3840, fps: 30 });
  });

  it("keeps full resolution when HD is on", async () => {
    render(<PhoneMediaPicker onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /^beach.mp4/ }));
    const hdSwitch = screen.getByRole("switch", { name: "HD" });
    fireEvent.click(hdSwitch);
    expect(hdSwitch).toHaveAttribute("aria-checked", "true");
    expect(localStorage.getItem("laamacut-phone-hd")).toBe("1");

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(addMediaFilesToTimeline).toHaveBeenCalled());
    expect(gallery.compress).not.toHaveBeenCalled();
  });

  it("explains how to allow access when it is refused", async () => {
    gallery.requestAccess.mockResolvedValueOnce({ access: "denied" as never });
    render(<PhoneMediaPicker onClose={() => {}} />);
    expect(await screen.findByText("Allow access to your videos and photos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose videos" })).toBeInTheDocument();
  });

  it("offers Android's pick-more prompt with limited access, and reloads after it", async () => {
    gallery.access.mockResolvedValueOnce({ access: "limited" as never });
    render(<PhoneMediaPicker onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Pick more" }));
    await waitFor(() => expect(gallery.requestMore).toHaveBeenCalled());
    await waitFor(() => expect(gallery.list).toHaveBeenCalledTimes(2));
  });
});

describe("PhoneMediaPicker for editor tools", () => {
  it("Sounds lists the phone's music and hands the picks to the editor", async () => {
    const onPicked = vi.fn(async (_files: File[], ready: (i: number, id: string) => void) => ready(0, "media-0"));
    render(<PhoneMediaPicker purpose="sound" onClose={() => {}} onPicked={onPicked} />);
    expect(screen.getByRole("dialog", { name: "Sounds" })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("checkbox", { name: /^song.mp3/ }));
    expect(gallery.requestAudioAccess).toHaveBeenCalled();
    expect(gallery.requestAccess).not.toHaveBeenCalled();
    expect(screen.queryByRole("tab", { name: "Photos" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(onPicked).toHaveBeenCalled());
    expect(onPicked.mock.calls[0][0].map((f) => f.name)).toEqual(["song.mp3"]);
    expect(addMediaFilesToTimeline).not.toHaveBeenCalled();
  });

  it("Replace keeps one pick at a time", async () => {
    const onPicked = vi.fn(async () => undefined);
    render(<PhoneMediaPicker purpose="replace" onClose={() => {}} onPicked={onPicked} />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /^beach.mp4/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /^party.mp4/ }));
    expect(screen.getByRole("checkbox", { name: /^beach.mp4/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    await waitFor(() => expect(onPicked).toHaveBeenCalled());
    expect((onPicked.mock.calls[0] as unknown as [File[]])[0].map((f) => f.name)).toEqual(["party.mp4"]);
  });
});
