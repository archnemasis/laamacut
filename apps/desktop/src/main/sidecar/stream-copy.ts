import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { resolveFfmpegPath } from "./ffmpeg-path";
import { MediaJob } from "./media-job";

/** What ffmpeg says about a file's video stream. */
export interface VideoStreamInfo {
  codec: string;
  width: number;
  height: number;
  fps: number;
  /** The first sound stream's codec, rate and layout ("aac 48000 stereo"), or null when silent. */
  audio: string | null;
}

/**
 * Reads the first video stream line ffmpeg prints, e.g.
 * "Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(...), 1920x1080 [SAR 1:1 DAR 16:9], 16000 kb/s, 30 fps, ..."
 */
export function parseVideoStream(stderr: string): VideoStreamInfo | null {
  const line = stderr.split("\n").find((l) => /Stream #\d+:\d+.*: Video: /.test(l));
  if (!line) return null;
  const codec = /Video: (\w+)/.exec(line)?.[1];
  const size = /, (\d{2,5})x(\d{2,5})/.exec(line);
  const fps = /, ([\d.]+) (?:fps|tbr)/.exec(line);
  if (!codec || !size) return null;
  let width = Number(size[1]);
  let height = Number(size[2]);
  // Phone videos stored sideways carry a display rotation; the export uses the shown size.
  if (/rotation of -?(90|270)/.test(stderr) || /displaymatrix: rotation of -?(90|270)/.test(stderr)) [width, height] = [height, width];
  const audioLine = /Stream #\d+:\d+.*: Audio: (\w+)[^,]*, (\d+) Hz, ([^,]+)/.exec(stderr);
  const audio = audioLine ? `${audioLine[1]} ${audioLine[2]} ${audioLine[3].trim()}` : null;
  return { codec, width, height, fps: fps ? Number(fps[1]) : 0, audio };
}

export function probeVideoStream(srcPath: string): Promise<VideoStreamInfo | null> {
  return new Promise((resolve) => {
    const proc = spawn(resolveFfmpegPath(), ["-hide_banner", "-i", srcPath]);
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    proc.on("error", () => resolve(null));
    // ffmpeg exits 1 with no output file named; the stream info is still printed.
    proc.on("close", () => resolve(parseVideoStream(stderr)));
  });
}

/**
 * ffmpeg's concat-demuxer list. Whole files only: a copied video with B-frames
 * can't stop on an exact frame, so clips cut short are rendered instead.
 */
export function buildConcatList(inputs: readonly { path: string }[]): string {
  return inputs.map((input) => `file '${input.path.replace(/\\/g, "/").replace(/'/g, "'\\''")}'\n`).join("");
}

export function buildStreamCopyArgs(listPath: string, outPath: string): string[] {
  return [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", listPath,
    "-map", "0:v:0",
    "-map", "0:a:0?",
    "-c", "copy",
    "-movflags", "+faststart",
    "-progress", "pipe:2",
    outPath,
  ];
}

const CODEC_NAMES: Record<string, string> = { h264: "h264", h265: "hevc" };

/**
 * Why these files can't simply be joined into the export as they are, or null
 * when they can: same codec as asked for, the export's size, no higher frame rate.
 */
export function streamCopyBlocker(
  streams: readonly (VideoStreamInfo | null)[],
  target: { codec: string; width: number; height: number; frameRate: number },
): string | null {
  const wanted = CODEC_NAMES[target.codec];
  if (!wanted) return `${target.codec} export`;
  for (const stream of streams) {
    if (!stream) return "could not read a clip";
    if (stream.codec !== wanted) return `${stream.codec} clip in a ${wanted} export`;
    if (stream.width !== target.width || stream.height !== target.height) {
      return `${stream.width}x${stream.height} clip in a ${target.width}x${target.height} export`;
    }
    if (stream.fps > target.frameRate + 0.5) return `${stream.fps}fps clip in a ${target.frameRate}fps export`;
    // Joined sound must match too, or a silent clip would slide the rest out of sync.
    if (stream.audio !== streams[0]?.audio) return "clips with different sound";
  }
  return null;
}

/** Joins the clips into `outPath` without re-encoding; resolves false (with why) when they don't qualify. */
export async function streamCopyExport(args: {
  inputs: { path: string; durationSec: number }[];
  outPath: string;
  codec: string;
  width: number;
  height: number;
  frameRate: number;
  onProgress?: (seconds: number) => void;
}): Promise<{ copied: boolean; reason?: string }> {
  const streams = await Promise.all(args.inputs.map((input) => probeVideoStream(input.path)));
  const reason = streamCopyBlocker(streams, args);
  if (reason) return { copied: false, reason };
  const listPath = path.join(os.tmpdir(), `openreel-concat-${randomUUID()}.txt`);
  await fs.writeFile(listPath, buildConcatList(args.inputs), "utf8");
  try {
    await new MediaJob(buildStreamCopyArgs(listPath, args.outPath)).run();
    return { copied: true };
  } catch (error) {
    await fs.rm(args.outPath, { force: true });
    return { copied: false, reason: error instanceof Error ? error.message : "ffmpeg failed" };
  } finally {
    await fs.rm(listPath, { force: true });
  }
}
