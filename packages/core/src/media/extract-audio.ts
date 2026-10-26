import { nativeMediaAvailable, extractAudioWavViaNative, NoAudioStreamError } from "./native-media-bridge";
import { hasAudioTrackSource } from "./audio-track-source";

export { NoAudioStreamError } from "./native-media-bridge";

export interface ExtractAudioProgressOptions {
  onProgress?: (progress: { phase?: string; progress: number }) => void;
}

// Desktop routes to the native FFmpeg sidecar; web uses the ffmpeg.wasm fallback.
// (Per-op progress is only surfaced on the wasm path for now; native runs without granular progress.)
export async function extractAudioWav(
  file: File | Blob,
  audioTrackIndex = 0,
  options?: ExtractAudioProgressOptions,
): Promise<Blob> {
  // Phone gallery videos hand over their sound directly (an .m4a, which every
  // caller decodes with decodeAudioData just like a WAV).
  if (hasAudioTrackSource(file) && audioTrackIndex === 0) {
    const track = await file.loadAudioTrack();
    if (!track) throw new NoAudioStreamError();
    return track;
  }
  if (nativeMediaAvailable()) {
    return extractAudioWavViaNative(file, audioTrackIndex);
  }
  const { getFFmpegFallback } = await import("./ffmpeg-fallback");
  return getFFmpegFallback().extractAudioAsWav(
    file,
    audioTrackIndex,
    options as Parameters<ReturnType<typeof getFFmpegFallback>["extractAudioAsWav"]>[2],
  );
}
