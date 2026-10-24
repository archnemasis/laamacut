import { describe, expect, it, vi } from "vitest";
import { saveBlobOnAndroid, type AndroidSaver } from "./android-downloads";

function fakeSaver(): AndroidSaver & { chunks: string[] } {
  const chunks: string[] = [];
  return {
    chunks,
    begin: vi.fn(async () => ({ id: "file-1" })),
    append: vi.fn(async ({ data }: { id: string; data: string }) => {
      chunks.push(data);
    }),
    finish: vi.fn(async () => ({ location: "Movies/Laamacut" })),
    abort: vi.fn(async () => undefined),
  };
}

describe("saveBlobOnAndroid", () => {
  it("streams the blob to the native saver in base64 chunks", async () => {
    const saver = fakeSaver();
    const bytes = new Uint8Array(2.5 * 1024 * 1024).map((_, i) => i % 251);
    const location = await saveBlobOnAndroid(saver, new Blob([bytes], { type: "video/mp4" }), "clip.mp4");

    expect(location).toBe("Movies/Laamacut");
    expect(saver.begin).toHaveBeenCalledWith({ filename: "clip.mp4", mimeType: "video/mp4" });
    expect(saver.chunks).toHaveLength(3);
    const decoded = saver.chunks.map((c) => Uint8Array.from(atob(c), (ch) => ch.charCodeAt(0)));
    expect(decoded.reduce((n, c) => n + c.length, 0)).toBe(bytes.length);
    expect(decoded[2][5]).toBe(bytes[2 * 1024 * 1024 + 5]);
  });

  it("aborts the native file when a write fails", async () => {
    const saver = fakeSaver();
    saver.append = vi.fn(async () => {
      throw new Error("Could not write the file");
    });
    await expect(saveBlobOnAndroid(saver, new Blob(["abc"]), "a.txt")).rejects.toThrow("Could not write");
    expect(saver.abort).toHaveBeenCalledWith({ id: "file-1" });
  });
});
