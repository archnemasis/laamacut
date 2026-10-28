import { describe, expect, it, vi } from "vitest";
import { analyzeVoiceActivity } from "./voice-activity";

const sampleRate = 16_000;

function recording(parts: Array<[seconds: number, amplitude: number]>): Float32Array {
  const total = parts.reduce((sum, [seconds]) => sum + seconds, 0);
  const samples = new Float32Array(Math.round(total * sampleRate));
  let offset = 0;
  for (const [seconds, amplitude] of parts) {
    const length = Math.round(seconds * sampleRate);
    for (let index = 0; index < length; index++) {
      samples[offset + index] = amplitude * Math.sin((2 * Math.PI * 220 * index) / sampleRate);
    }
    offset += length;
  }
  return samples;
}

describe("analyzeVoiceActivity", () => {
  it("scores loud speaking windows high and the quiet room low", async () => {
    const progress = vi.fn();
    const track = await analyzeVoiceActivity(recording([[1, 0.002], [1, 0.4], [1, 0.002]]), sampleRate, { onProgress: progress });
    const at = (seconds: number) => track.probabilities[Math.floor((seconds * 1_000) / track.windowMs)]!;

    expect(track.windowMs).toBe(32);
    expect(at(0.5)).toBe(0);
    expect(at(1.5)).toBe(1);
    expect(at(2.5)).toBe(0);
    expect(progress).toHaveBeenLastCalledWith(track.probabilities.length, track.probabilities.length);
  });

  it("does not call a uniformly quiet recording speech", async () => {
    const track = await analyzeVoiceActivity(recording([[2, 0.001]]), sampleRate);
    expect(Math.max(...track.probabilities)).toBeLessThan(0.5);
  });

  it("rejects an invalid sample rate", async () => {
    await expect(analyzeVoiceActivity(new Float32Array(10), 0)).rejects.toThrow("sample rate");
  });
});
