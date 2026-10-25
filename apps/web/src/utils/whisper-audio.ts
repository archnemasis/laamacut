const WHISPER_SAMPLE_RATE = 16_000;

/** Mix an AudioBuffer to mono and resample only the selected source range. */
export function audioBufferToWhisperSamples(
  audioBuffer: AudioBuffer,
  startTime = 0,
  endTime = audioBuffer.duration,
): Float32Array {
  const sourceRate = audioBuffer.sampleRate;
  const startFrame = Math.max(
    0,
    Math.min(audioBuffer.length, Math.floor(startTime * sourceRate)),
  );
  const endFrame = Math.max(
    startFrame,
    Math.min(audioBuffer.length, Math.ceil(endTime * sourceRate)),
  );
  const sourceLength = endFrame - startFrame;
  if (sourceLength === 0) return new Float32Array();

  const outputLength = Math.max(
    1,
    Math.round((sourceLength * WHISPER_SAMPLE_RATE) / sourceRate),
  );
  const output = new Float32Array(outputLength);
  const channels = Array.from(
    { length: audioBuffer.numberOfChannels },
    (_, index) => audioBuffer.getChannelData(index),
  );
  const sourceFramesPerOutput = sourceRate / WHISPER_SAMPLE_RATE;

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const sourcePosition = startFrame + outputIndex * sourceFramesPerOutput;
    const leftIndex = Math.min(endFrame - 1, Math.floor(sourcePosition));
    const rightIndex = Math.min(endFrame - 1, leftIndex + 1);
    const fraction = sourcePosition - leftIndex;
    let mixed = 0;
    for (const channel of channels) {
      mixed +=
        channel[leftIndex] +
        (channel[rightIndex] - channel[leftIndex]) * fraction;
    }
    output[outputIndex] = mixed / channels.length;
  }

  return output;
}

/** One RBJ biquad pass (high- or low-pass) over the samples, in place. */
function biquad(samples: Float32Array, type: "highpass" | "lowpass", frequency: number, rate = WHISPER_SAMPLE_RATE): void {
  const w0 = (2 * Math.PI * frequency) / rate;
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
  const cos = Math.cos(w0);
  const b1 = type === "lowpass" ? 1 - cos : -(1 + cos);
  const b0 = type === "lowpass" ? b1 / 2 : (1 + cos) / 2;
  const a0 = 1 + alpha;
  const [nb0, nb1, nb2, na1, na2] = [b0 / a0, b1 / a0, b0 / a0, (-2 * cos) / a0, (1 - alpha) / a0];
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const y = nb0 * x + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    samples[i] = y;
  }
}

/**
 * Help Whisper hear words over music: keep the voice band (cutting bass,
 * drums and hiss, which make it answer "[Music]") and bring quiet speech up.
 */
export function emphasizeSpeech(samples: Float32Array): Float32Array {
  if (samples.length === 0) return samples;
  biquad(samples, "highpass", 180);
  biquad(samples, "highpass", 180);
  biquad(samples, "lowpass", 4000);
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  const gain = peak > 0 ? Math.min(8, 0.9 / peak) : 1;
  if (gain !== 1) for (let i = 0; i < samples.length; i++) samples[i] *= gain;
  return samples;
}

export { WHISPER_SAMPLE_RATE };
