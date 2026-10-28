import type { MulticamVadTrack } from "./automatic-edit";

export const VOICE_ACTIVITY_WINDOW_MS = 32;

export interface VoiceActivityOptions {
  windowMs?: number;
  onProgress?: (completed: number, total: number) => void;
}

/**
 * Estimates how likely each short window is to contain speech from its
 * loudness alone: quiet windows near the recording's noise floor score 0 and
 * windows near its speaking level score 1. No model, nothing downloaded.
 */
export async function analyzeVoiceActivity(
  samples: Float32Array,
  sampleRate: number,
  options: VoiceActivityOptions = {},
): Promise<MulticamVadTrack> {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error("Voice detection requires a positive audio sample rate");
  }
  const windowMs = options.windowMs ?? VOICE_ACTIVITY_WINDOW_MS;
  const windowSamples = Math.max(1, Math.round((sampleRate * windowMs) / 1_000));
  const frameCount = Math.ceil(samples.length / windowSamples);
  const levels = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame++) {
    const start = frame * windowSamples;
    const end = Math.min(samples.length, start + windowSamples);
    let sum = 0;
    for (let index = start; index < end; index++) sum += samples[index]! * samples[index]!;
    const rms = Math.sqrt(sum / Math.max(1, end - start));
    levels[frame] = 20 * Math.log10(Math.max(rms, 1e-6));
    if (options.onProgress && (frame % 1_000 === 0 || frame === frameCount - 1)) {
      options.onProgress(frame + 1, frameCount);
    }
  }

  const sorted = Float32Array.from(levels).sort();
  const percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? -120;
  const noiseFloor = percentile(0.1);
  const speechLevel = Math.max(percentile(0.9), noiseFloor + 12);
  // Speech starts about a third of the way from the floor to the speaking level.
  const onset = noiseFloor + (speechLevel - noiseFloor) * 0.3;
  const full = noiseFloor + (speechLevel - noiseFloor) * 0.6;

  const probabilities = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame++) {
    probabilities[frame] = Math.min(1, Math.max(0, (levels[frame]! - onset) / (full - onset)));
  }
  return { windowMs, probabilities };
}
