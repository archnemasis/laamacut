import { describe, expect, it } from "vitest";
import { encodePcmChunks } from "./native-whisper";

const decode = (base64: string): number[] => {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  return Array.from({ length: bytes.length / 2 }, (_, i) => view.getInt16(i * 2, true));
};

describe("encodePcmChunks", () => {
  it("turns float samples into 16-bit little-endian PCM, clamping overs", () => {
    const [chunk] = encodePcmChunks(new Float32Array([0, 0.5, -1, 1, 2]));
    expect(decode(chunk)).toEqual([0, 16384, -32767, 32767, 32767]);
  });

  it("splits long audio into pieces", () => {
    const chunks = encodePcmChunks(new Float32Array(10), 4);
    expect(chunks.map((c) => decode(c).length)).toEqual([4, 4, 2]);
  });
});
