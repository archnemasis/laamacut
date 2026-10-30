import { describe, expect, it } from "vitest";
import { buildConcatList, buildStreamCopyArgs, parseVideoStream, streamCopyBlocker } from "./stream-copy";

const H264_1080P30 = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'a.mp4':
  Duration: 00:00:10.00, start: 0.000000, bitrate: 16123 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1920x1080 [SAR 1:1 DAR 16:9], 15930 kb/s, 30 fps, 30 tbr, 15360 tbn (default)
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 192 kb/s (default)`;

describe("parseVideoStream", () => {
  it("reads codec, size and frame rate", () => {
    expect(parseVideoStream(H264_1080P30)).toEqual({ codec: "h264", width: 1920, height: 1080, fps: 30, audio: "aac 48000 stereo" });
  });

  it("swaps the size of a video stored sideways", () => {
    const rotated = `${H264_1080P30}\n      Side data:\n        displaymatrix: rotation of -90.00 degrees`;
    expect(parseVideoStream(rotated)).toMatchObject({ width: 1080, height: 1920 });
  });

  it("is null without a video stream", () => {
    expect(parseVideoStream("  Stream #0:0: Audio: mp3, 44100 Hz, stereo")).toBeNull();
  });
});

describe("streamCopyBlocker", () => {
  const target = { codec: "h264", width: 1920, height: 1080, frameRate: 30 };
  const stream = { codec: "h264", width: 1920, height: 1080, fps: 30, audio: "aac 48000 stereo" };

  it("allows matching clips", () => {
    expect(streamCopyBlocker([stream, stream], target)).toBeNull();
  });

  it("says why other clips need rendering", () => {
    expect(streamCopyBlocker([{ ...stream, codec: "hevc" }], target)).toBe("hevc clip in a h264 export");
    expect(streamCopyBlocker([{ ...stream, width: 3840, height: 2160 }], target)).toBe("3840x2160 clip in a 1920x1080 export");
    expect(streamCopyBlocker([{ ...stream, fps: 60 }], target)).toBe("60fps clip in a 30fps export");
    expect(streamCopyBlocker([null], target)).toBe("could not read a clip");
    expect(streamCopyBlocker([stream, { ...stream, audio: null }], target)).toBe("clips with different sound");
    expect(streamCopyBlocker([stream], { ...target, codec: "prores" })).toBe("prores export");
  });
});

describe("buildConcatList", () => {
  it("lists each whole file, escaping quotes and backslashes", () => {
    expect(buildConcatList([{ path: "C:\\clips\\it's.mp4" }])).toBe("file 'C:/clips/it'\\''s.mp4'\n");
  });
});

describe("buildStreamCopyArgs", () => {
  it("copies the first video and audio streams without re-encoding", () => {
    const args = buildStreamCopyArgs("list.txt", "out.mp4");
    expect(args).toEqual(expect.arrayContaining(["-f", "concat", "-c", "copy", "out.mp4"]));
    expect(args.join(" ")).toContain("-map 0:a:0?");
  });
});
