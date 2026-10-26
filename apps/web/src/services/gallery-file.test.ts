import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GalleryFile, installGalleryFileUrls } from "./gallery-file";

const bytes = new TextEncoder().encode("0123456789");
const source = { uri: "content://media/external/video/media/7", name: "beach.mp4", mime: "video/mp4", size: bytes.length };

/** A media server that answers ranges like MediaServer.java. */
const serve = vi.fn(async (url: string, init?: RequestInit) => {
  if (url.includes("/_capacitor_file_/")) return new Response(new Blob(["m4a"]));
  // jsdom's Headers hides Range, so read the plain object the file sends.
  const range = (init?.headers as Record<string, string> | undefined)?.Range;
  const [, from, to] = /bytes=(\d+)-(\d+)/.exec(range ?? "") ?? [];
  return new Response(new TextDecoder().decode(bytes.slice(Number(from), Number(to) + 1)), { status: 206 });
});

beforeEach(() => {
  vi.stubGlobal("fetch", serve);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
});

describe("GalleryFile", () => {
  it("looks like the whole file but holds none of it", () => {
    const file = new GalleryFile(source);
    expect(file).toBeInstanceOf(Blob);
    expect(file.size).toBe(10);
    expect(file.type).toBe("video/mp4");
    expect(file.url).toContain("/_laamacut_media_/beach.mp4?uri=content%3A%2F%2Fmedia%2Fexternal%2Fvideo%2Fmedia%2F7");
    expect(serve).not.toHaveBeenCalled();
  });

  it("reads only the bytes asked for", async () => {
    const part = new GalleryFile(source).slice(2, 6);
    expect(part.size).toBe(4);
    expect(await part.text()).toBe("2345");
    expect(serve.mock.calls[0][1]?.headers).toEqual({ Range: "bytes=2-5" });
    expect(await new GalleryFile(source).slice(-3).text()).toBe("789");
    expect(await new GalleryFile(source).slice(4).slice(1, 3).text()).toBe("56");
  });

  it("streams from where the reader starts", async () => {
    const reader = new GalleryFile(source).slice(7).stream().getReader();
    const chunks: number[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(...value);
    }
    expect(new TextDecoder().decode(new Uint8Array(chunks))).toBe("789");
  });

  it("plays in a video element from the media server", () => {
    URL.createObjectURL = vi.fn(() => "blob:local");
    installGalleryFileUrls();
    const file = new GalleryFile(source);
    expect(URL.createObjectURL(file)).toBe(file.url);
    expect(URL.createObjectURL(new Blob(["x"]))).toBe("blob:local");
  });

  it("asks the phone for the sound once", async () => {
    const extractAudio = vi.fn(async () => ({ path: "file:///cache/audio-tracks/a.m4a" }));
    (window as unknown as { Capacitor: unknown }).Capacitor = {
      Plugins: { LaamacutGallery: { extractAudio } },
      convertFileSrc: (path: string) => `https://localhost/_capacitor_file_/${path}`,
    };
    const file = new GalleryFile({ ...source, uri: "content://media/external/video/media/8" });
    const [first, second] = await Promise.all([file.loadAudioTrack(), new GalleryFile({ ...source, uri: "content://media/external/video/media/8" }).loadAudioTrack()]);
    expect(first?.type).toBe("audio/mp4");
    expect(second).toBe(first);
    expect(extractAudio).toHaveBeenCalledTimes(1);
  });
});
