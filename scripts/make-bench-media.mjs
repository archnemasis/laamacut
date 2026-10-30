#!/usr/bin/env node
// Makes synthetic benchmark media (colour bars + tone, nothing personal) for
// testing import, playback and export on the phone and PC.
//
//   node scripts/make-bench-media.mjs [outDir] [--only name1,name2]
//
// Needs ffmpeg on PATH. Files land in bench-media/ (gitignored) by default.
// Push to the phone's test album with:
//   adb push bench-media/. "/sdcard/Movies/Laamacut Test/"
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const onlyIndex = args.indexOf("--only");
const only = onlyIndex >= 0 ? new Set(args[onlyIndex + 1].split(",")) : null;
const outDir = resolve(args.find((a, i) => !a.startsWith("--") && i !== onlyIndex + 1) ?? "bench-media");
mkdirSync(outDir, { recursive: true });

const SECONDS = 10;

/** A test video: size, frame rate, codec and a realistic phone-camera bitrate. */
function video(name, w, h, fps, codec, mbps, extra = {}) {
  const seconds = extra.seconds ?? SECONDS;
  const ext = extra.ext ?? "mp4";
  const v = ["-f", "lavfi", "-i", `testsrc2=size=${w}x${h}:rate=${fps}:duration=${seconds}`];
  const a = extra.noAudio
    ? []
    : ["-f", "lavfi", "-i", `sine=frequency=440:sample_rate=${extra.rate ?? 48000}:duration=${seconds}`];
  const enc = {
    h264: ["-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-profile:v", "high"],
    hevc: ["-c:v", "libx265", "-preset", "ultrafast", "-pix_fmt", extra.tenBit ? "yuv420p10le" : "yuv420p", "-tag:v", "hvc1", "-x265-params", "log-level=error"],
    av1: ["-c:v", "libsvtav1", "-preset", "10", "-pix_fmt", "yuv420p"],
    vp9: ["-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8", "-row-mt", "1", "-pix_fmt", "yuv420p"],
  }[codec];
  // SVT-AV1 only takes a max rate in CRF mode.
  const cap = codec === "av1" ? [] : ["-maxrate", `${Math.round(mbps * 1.5)}M`, "-bufsize", `${mbps * 2}M`];
  const rate = ["-b:v", `${mbps}M`, ...cap, "-g", String(Math.round(fps))];
  const colour = extra.tenBit
    ? ["-color_primaries", "bt2020", "-color_trc", "arib-std-b67", "-colorspace", "bt2020nc"]
    : [];
  const vf = extra.vf ? ["-vf", extra.vf] : [];
  const audio = extra.noAudio ? [] : codec === "vp9" ? ["-c:a", "libopus", "-b:a", "128k"] : ["-c:a", "aac", "-b:a", "192k", "-ac", String(extra.channels ?? 2)];
  const out = join(outDir, `${name}.${ext}`);
  return { name, out, cmd: [...v, ...a, ...enc, ...rate, ...colour, ...vf, ...(extra.vfr ? ["-fps_mode", "vfr"] : []), ...audio, "-shortest", "-movflags", "+faststart", out], after: extra.after };
}

function photo(name, w, h, ext, extra = []) {
  const out = join(outDir, `${name}.${ext}`);
  return { name, out, cmd: ["-f", "lavfi", "-i", `testsrc2=size=${w}x${h}:rate=1`, ...extra, "-frames:v", "1", out] };
}

function audio(name, seconds, ext, codec) {
  const out = join(outDir, `${name}.${ext}`);
  const tone = `sine=frequency=330:sample_rate=48000:duration=${seconds}`;
  return { name, out, cmd: ["-f", "lavfi", "-i", tone, "-f", "lavfi", "-i", `anoisesrc=color=pink:amplitude=0.05:duration=${seconds}`, "-filter_complex", "amix=inputs=2", ...codec, out] };
}

const jobs = [
  video("bench-0720p30-h264", 1280, 720, 30, "h264", 8),
  video("bench-1080p30-h264", 1920, 1080, 30, "h264", 16),
  video("bench-1080p60-h264", 1920, 1080, 60, "h264", 24),
  video("bench-1080p120-h264", 1920, 1080, 120, "h264", 40),
  video("bench-1080p240-h264", 1920, 1080, 240, "h264", 60),
  video("bench-1440p30-h264", 2560, 1440, 30, "h264", 24),
  video("bench-1440p60-h264", 2560, 1440, 60, "h264", 35),
  video("bench-1440p120-h264", 2560, 1440, 120, "h264", 60),
  video("bench-1440p60-hevc", 2560, 1440, 60, "hevc", 25),
  video("bench-1440p120-hevc", 2560, 1440, 120, "hevc", 40),
  video("bench-2160p30-h264", 3840, 2160, 30, "h264", 45),
  video("bench-2160p60-h264", 3840, 2160, 60, "h264", 60),
  video("bench-2160p30-hevc", 3840, 2160, 30, "hevc", 40),
  video("bench-2160p60-hevc", 3840, 2160, 60, "hevc", 50),
  video("bench-2160p120-hevc", 3840, 2160, 120, "hevc", 80),
  video("bench-2160p30-hevc10-hlg", 3840, 2160, 30, "hevc", 50, { tenBit: true }),
  video("bench-portrait-1080x1920p60-h264", 1080, 1920, 60, "h264", 24),
  video("bench-portrait-1440x2560p60-hevc", 1440, 2560, 60, "hevc", 30),
  video("bench-rotated90-1080p30-h264", 1920, 1080, 30, "h264", 16, { after: "rotate" }),
  video("bench-vfr-1080p-h264", 1920, 1080, 60, "h264", 20, { vf: "select='not(mod(n\\,4))+gt(random(0)\\,0.4)'", vfr: true }),
  video("bench-noaudio-1080p30-h264", 1920, 1080, 30, "h264", 16, { noAudio: true }),
  video("bench-mono44k-1080p30-h264", 1920, 1080, 30, "h264", 16, { rate: 44100, channels: 1 }),
  video("bench-1080p30-av1", 1920, 1080, 30, "av1", 6),
  video("bench-1080p30-vp9", 1920, 1080, 30, "vp9", 8, { ext: "webm" }),
  video("bench-1080p30-h264-mov", 1920, 1080, 30, "h264", 16, { ext: "mov" }),
  video("bench-long5min-1080p30-h264", 1920, 1080, 30, "h264", 8, { seconds: 300 }),
  photo("bench-photo-12mp", 4000, 3000, "jpg", ["-q:v", "3"]),
  photo("bench-photo-50mp", 8160, 6120, "jpg", ["-q:v", "3"]),
  photo("bench-photo-alpha", 1080, 1080, "png", ["-vf", "format=rgba,colorchannelmixer=aa=0.6"]),
  photo("bench-photo-2048", 2048, 2048, "webp", ["-quality", "85"]),
  audio("bench-audio-3min", 180, "mp3", ["-c:a", "libmp3lame", "-b:a", "192k"]),
  audio("bench-audio-1min", 60, "m4a", ["-c:a", "aac", "-b:a", "192k"]),
  audio("bench-audio-30s", 30, "wav", ["-c:a", "pcm_s16le"]),
];

function run(argv) {
  return new Promise((done, fail) => {
    const child = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...argv], { stdio: ["ignore", "inherit", "inherit"] });
    child.on("exit", (code) => (code === 0 ? done() : fail(new Error(`ffmpeg exited ${code}`))));
  });
}

async function make(job) {
  if (only && !only.has(job.name)) return;
  if (!only && existsSync(job.out)) return console.log(`skip ${job.name} (exists)`);
  const started = Date.now();
  if (job.after === "rotate") {
    // Stored landscape with a 90° display matrix, like a phone held upright.
    const raw = job.out.replace(/\.mp4$/, ".raw.mp4");
    await run(job.cmd.slice(0, -1).concat(raw));
    await run(["-display_rotation", "90", "-i", raw, "-c", "copy", job.out]);
    await import("node:fs/promises").then((fs) => fs.rm(raw));
  } else {
    await run(job.cmd);
  }
  const mb = (statSync(job.out).size / 1e6).toFixed(1);
  console.log(`made ${job.name} ${mb} MB in ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

// A few at a time: each ffmpeg already uses several cores.
const queue = [...jobs];
const failed = [];
await Promise.all(Array.from({ length: 3 }, async () => {
  for (let job = queue.shift(); job; job = queue.shift()) {
    await make(job).catch((error) => {
      failed.push(job.name);
      console.error(`FAILED ${job.name}: ${error.message}`);
    });
  }
}));
console.log(`done: ${outDir}${failed.length ? ` (failed: ${failed.join(", ")})` : ""}`);
process.exitCode = failed.length ? 1 : 0;
