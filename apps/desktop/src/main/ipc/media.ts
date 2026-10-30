import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import {
  MediaJob,
  buildProxyArgs,
  buildTranscodeArgs,
  buildExtractAudioArgs,
  type ProxyPreset,
  type TranscodeContainer,
} from "../sidecar/media-job";
import { probeAudioStreams as probe, type AudioStreamInfo } from "../sidecar/probe-streams";
import { streamCopyExport as runStreamCopy } from "../sidecar/stream-copy";
import { pathGrants } from "./fs";

function tmpPath(ext: string): string {
  return pathGrants.grant(path.join(os.tmpdir(), `openreel-${randomUUID()}.${ext}`));
}

export async function generateProxy(args: {
  srcPath: string;
  preset: ProxyPreset;
}): Promise<{ outPath: string }> {
  const outPath = tmpPath("mp4");
  await new MediaJob(buildProxyArgs(pathGrants.require(args.srcPath), outPath, args.preset)).run();
  return { outPath };
}

export async function transcode(args: {
  srcPath: string;
  container: TranscodeContainer;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
}): Promise<{ outPath: string }> {
  const outPath = tmpPath(args.container);
  await new MediaJob(
    buildTranscodeArgs(pathGrants.require(args.srcPath), outPath, {
      container: args.container,
      videoBitrateKbps: args.videoBitrateKbps,
      audioBitrateKbps: args.audioBitrateKbps,
    }),
  ).run();
  return { outPath };
}

export async function extractAudioWav(args: {
  srcPath: string;
  streamIndex?: number;
}): Promise<{ outPath: string }> {
  const outPath = tmpPath("wav");
  await new MediaJob(buildExtractAudioArgs(pathGrants.require(args.srcPath), outPath, args.streamIndex)).run();
  return { outPath };
}

export async function probeAudioStreams(args: {
  srcPath: string;
}): Promise<{ streams: AudioStreamInfo[] }> {
  return { streams: await probe(pathGrants.require(args.srcPath)) };
}

/** Joins plain clips into the chosen export file without re-encoding, when they allow it. */
export async function streamCopyExport(args: {
  inputs: { path: string; durationSec: number }[];
  outPath: string;
  codec: string;
  width: number;
  height: number;
  frameRate: number;
}): Promise<{ copied: boolean; reason?: string }> {
  return runStreamCopy({
    ...args,
    inputs: args.inputs.map((input) => ({ path: pathGrants.require(input.path), durationSec: input.durationSec })),
    outPath: pathGrants.require(args.outPath),
  });
}
