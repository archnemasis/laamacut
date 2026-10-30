import { describe, expect, it } from "vitest";
import { LoudnessMeter, loudnessGain } from "./loudness";

const RATE = 48000;

function sine(seconds: number, dbfs: number, hz = 1000): Float32Array {
  const amplitude = Math.pow(10, dbfs / 20);
  const out = new Float32Array(seconds * RATE);
  for (let i = 0; i < out.length; i++) out[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / RATE);
  return out;
}

describe("LoudnessMeter", () => {
  it("reads a stereo -23 dBFS 1 kHz tone as -23 LUFS (EBU Tech 3341 case 1)", () => {
    const meter = new LoudnessMeter(RATE);
    const tone = sine(20, -23);
    meter.add([tone, tone]);
    expect(meter.integrated()).toBeCloseTo(-23, 1);
    expect(meter.peakDb()).toBeCloseTo(-23, 1);
  });

  it("gives the same answer when fed in uneven chunks", () => {
    const whole = new LoudnessMeter(RATE);
    const pieces = new LoudnessMeter(RATE);
    const tone = sine(10, -18, 440);
    whole.add([tone]);
    for (let start = 0; start < tone.length; start += 12345) pieces.add([tone.subarray(start, start + 12345)]);
    expect(pieces.integrated()).toBeCloseTo(whole.integrated(), 6);
  });

  it("gates out silence so quiet gaps don't drag the reading down", () => {
    const meter = new LoudnessMeter(RATE);
    const tone = sine(10, -23);
    const gap = new Float32Array(10 * RATE);
    meter.add([tone, tone]);
    meter.add([gap, gap]);
    // The few blocks straddling the edge of the gap shave off a hundredth or so.
    expect(Math.abs(meter.integrated() + 23)).toBeLessThan(0.1);
  });

  it("is -Infinity for silence", () => {
    const meter = new LoudnessMeter(RATE);
    meter.add([new Float32Array(RATE * 2)]);
    expect(meter.integrated()).toBe(-Infinity);
  });
});

describe("loudnessGain", () => {
  it("moves the level to the target", () => {
    expect(20 * Math.log10(loudnessGain(-23, -20, -14))).toBeCloseTo(9);
    expect(20 * Math.log10(loudnessGain(-8, -0.5, -14))).toBeCloseTo(-6);
  });

  it("stops short of clipping", () => {
    expect(20 * Math.log10(loudnessGain(-23, -4, -14))).toBeCloseTo(3);
  });

  it("leaves silence alone", () => {
    expect(loudnessGain(-Infinity, -Infinity, -14)).toBe(1);
  });
});
