/**
 * The Android app's LaamacutWhisper plugin (WhisperPlugin.java): whisper.cpp
 * running natively, several times faster than the web worker's WebAssembly.
 * Audio goes over in chunks of 16-bit samples, since the bridge carries text.
 */
export interface NativeWhisperPlugin {
  available(): Promise<{ available: boolean; reason?: string }>;
  begin(): Promise<void>;
  append(options: { data: string }): Promise<void>;
  transcribe(options: { language?: string; task?: "transcribe" | "translate" }): Promise<NativeWhisperResult>;
  addListener(event: "progress", listener: (event: { progress: number }) => void): Promise<{ remove: () => Promise<void> }>;
}

export interface NativeWhisperResult {
  text: string;
  chunks: { text: string; timestamp: [number | null, number | null] }[];
}

export function getNativeWhisper(): NativeWhisperPlugin | undefined {
  if (typeof window === "undefined") return undefined;
  const plugins = window.Capacitor?.Plugins as { LaamacutWhisper?: NativeWhisperPlugin } | undefined;
  return plugins?.LaamacutWhisper;
}

let availability: Promise<boolean> | null = null;

/** Whether this phone can run captions natively (asked once). */
export function nativeWhisperAvailable(): Promise<boolean> {
  const plugin = getNativeWhisper();
  if (!plugin) return Promise.resolve(false);
  availability ??= plugin.available().then((result) => result.available, () => false);
  return availability;
}

/** 16 kHz float samples as base64 16-bit little-endian PCM, in pieces small enough for the bridge. */
export function encodePcmChunks(samples: Float32Array, samplesPerChunk = 256 * 1024): string[] {
  const chunks: string[] = [];
  for (let start = 0; start < samples.length; start += samplesPerChunk) {
    const end = Math.min(samples.length, start + samplesPerChunk);
    const bytes = new Uint8Array((end - start) * 2);
    const view = new DataView(bytes.buffer);
    for (let i = start; i < end; i++) {
      const clamped = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16((i - start) * 2, Math.round(clamped * 32767), true);
    }
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    chunks.push(btoa(binary));
  }
  return chunks;
}

/** Transcribe 16 kHz mono samples on the phone. `onProgress` gets 0-1. */
export async function transcribeNatively(
  samples: Float32Array,
  options: { language?: string; task?: "transcribe" | "translate" },
  onProgress?: (progress: number) => void,
): Promise<NativeWhisperResult> {
  const plugin = getNativeWhisper();
  if (!plugin) throw new Error("Native captions are not available.");
  await plugin.begin();
  for (const data of encodePcmChunks(samples)) await plugin.append({ data });
  const listener = onProgress ? await plugin.addListener("progress", (event) => onProgress(event.progress)) : null;
  try {
    return await plugin.transcribe({ language: options.language, task: options.task });
  } finally {
    await listener?.remove();
  }
}
