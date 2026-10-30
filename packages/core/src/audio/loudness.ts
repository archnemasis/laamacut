/**
 * Integrated loudness (ITU-R BS.1770-4 / EBU R128), measured in pieces so a
 * long timeline can be fed through chunk by chunk.
 */

interface Biquad {
  b0: number; b1: number; b2: number; a1: number; a2: number;
}

/** K-weighting: a high shelf for the head, then a high-pass, for any sample rate. */
function kWeighting(sampleRate: number): [Biquad, Biquad] {
  let f0 = 1681.974450955533;
  const gain = 3.999843853973347;
  let q = 0.7071752369554196;
  let k = Math.tan((Math.PI * f0) / sampleRate);
  const vh = Math.pow(10, gain / 20);
  const vb = Math.pow(vh, 0.4996667741545416);
  let a0 = 1 + k / q + k * k;
  const shelf = {
    b0: (vh + (vb * k) / q + k * k) / a0,
    b1: (2 * (k * k - vh)) / a0,
    b2: (vh - (vb * k) / q + k * k) / a0,
    a1: (2 * (k * k - 1)) / a0,
    a2: (1 - k / q + k * k) / a0,
  };
  f0 = 38.13547087602444;
  q = 0.5003270373238773;
  k = Math.tan((Math.PI * f0) / sampleRate);
  a0 = 1 + k / q + k * k;
  const highPass = { b0: 1, b1: -2, b2: 1, a1: (2 * (k * k - 1)) / a0, a2: (1 - k / q + k * k) / a0 };
  return [shelf, highPass];
}

const ABSOLUTE_GATE = -70;
const RELATIVE_GATE = -10;

const energyToLufs = (energy: number) => -0.691 + 10 * Math.log10(energy);

export class LoudnessMeter {
  private readonly filters: [Biquad, Biquad];
  /** Per channel, per filter: x1, x2, y1, y2. */
  private state: Float64Array[] = [];
  private readonly stepSize: number;
  private stepEnergy = 0;
  private stepFill = 0;
  /** The last four 100 ms steps, which make one 400 ms block. */
  private recentSteps: number[] = [];
  private blocks: number[] = [];
  private peak = 0;

  constructor(sampleRate: number) {
    this.filters = kWeighting(sampleRate);
    this.stepSize = Math.round(sampleRate / 10);
  }

  /** Feeds the next stretch of audio, one array per channel (left, right…). */
  add(channels: readonly Float32Array[]): void {
    const frames = channels[0]?.length ?? 0;
    while (this.state.length < channels.length) this.state.push(new Float64Array(8));
    const [s, h] = this.filters;
    for (let i = 0; i < frames; i++) {
      let energy = 0;
      for (let c = 0; c < channels.length; c++) {
        const x = channels[c][i];
        const abs = Math.abs(x);
        if (abs > this.peak) this.peak = abs;
        const st = this.state[c];
        const y1 = s.b0 * x + s.b1 * st[0] + s.b2 * st[1] - s.a1 * st[2] - s.a2 * st[3];
        st[1] = st[0]; st[0] = x; st[3] = st[2]; st[2] = y1;
        const y2 = h.b0 * y1 + h.b1 * st[4] + h.b2 * st[5] - h.a1 * st[6] - h.a2 * st[7];
        st[5] = st[4]; st[4] = y1; st[7] = st[6]; st[6] = y2;
        // Surround channels would be weighted 1.41; the editor mixes to stereo or mono.
        energy += y2 * y2;
      }
      this.stepEnergy += energy;
      if (++this.stepFill === this.stepSize) this.closeStep();
    }
  }

  private closeStep(): void {
    this.recentSteps.push(this.stepEnergy / this.stepSize);
    if (this.recentSteps.length > 4) this.recentSteps.shift();
    if (this.recentSteps.length === 4) this.blocks.push(this.recentSteps.reduce((a, b) => a + b, 0) / 4);
    this.stepEnergy = 0;
    this.stepFill = 0;
  }

  /** Integrated loudness in LUFS; -Infinity for silence or under 400 ms of audio. */
  integrated(): number {
    const loud = this.blocks.filter((energy) => energyToLufs(energy) > ABSOLUTE_GATE);
    if (!loud.length) return -Infinity;
    const relative = energyToLufs(loud.reduce((a, b) => a + b, 0) / loud.length) + RELATIVE_GATE;
    const gated = loud.filter((energy) => energyToLufs(energy) > relative);
    return energyToLufs(gated.reduce((a, b) => a + b, 0) / gated.length);
  }

  /** The highest sample, in dBFS. */
  peakDb(): number {
    return this.peak > 0 ? 20 * Math.log10(this.peak) : -Infinity;
  }
}

/**
 * The linear gain that brings the audio to `targetLufs`, held back so the
 * loudest sample stays under `ceilingDb`. Silence is left alone.
 */
export function loudnessGain(measuredLufs: number, peakDb: number, targetLufs: number, ceilingDb = -1): number {
  if (!Number.isFinite(measuredLufs)) return 1;
  const change = Math.min(targetLufs - measuredLufs, Number.isFinite(peakDb) ? ceilingDb - peakDb : Infinity);
  return Math.pow(10, change / 20);
}

export function applyGain(buffer: AudioBuffer, gain: number): void {
  if (gain === 1) return;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) data[i] *= gain;
  }
}

export function measureBuffer(meter: LoudnessMeter, buffer: AudioBuffer): void {
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
  meter.add(channels);
}
