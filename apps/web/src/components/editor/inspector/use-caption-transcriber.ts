import { useCallback, useEffect, useRef, useState } from "react";
import type { Clip, MediaItem, TranscriptionSegment } from "@openreel/core";
import { loadAudioBuffer } from "../../../utils/load-audio-buffer";
import { audioBufferToWhisperSamples, emphasizeSpeech } from "../../../utils/whisper-audio";
import { stripNonSpeech } from "../../../services/caption-text";
import { DEFAULT_WHISPER_MODEL, isWhisperModelKey, type WhisperModelKey } from "../../../workers/whisper-models";
import { nativeWhisperAvailable, transcribeNatively } from "../../../services/native-whisper";

interface WorkerChunk {
  text: string;
  timestamp: [number | null, number | null];
}

export type WorkerState = "idle" | "loading" | "ready";

export interface TranscribeOptions {
  /** A Whisper language code, or undefined to let Whisper detect it. */
  language?: string;
  /** "translate" writes the captions in English whatever language is spoken. */
  task?: "transcribe" | "translate";
}

/** The Android app ships the fast model, so it loads instead of downloading. */
export const builtInModel = (): boolean => typeof window !== "undefined" && Boolean(window.Capacitor?.convertFileSrc);

/**
 * The local Whisper worker behind Auto captions: loads the model, reads a
 * clip's sound and turns it into timed caption segments on the timeline.
 */
export function useCaptionTranscriber() {
  const workerRef = useRef<Worker | null>(null);
  const [workerState, setWorkerState] = useState<WorkerState>("idle");
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  // The Android app has the fast model built in; the big one is too heavy for phones.
  const [selectedModel, setSelectedModel] = useState<WhisperModelKey>(() => (builtInModel() ? "fast" : DEFAULT_WHISPER_MODEL));
  const [readyModels, setReadyModels] = useState<Set<WhisperModelKey>>(() => new Set());
  const [modelBackends, setModelBackends] = useState<Partial<Record<WhisperModelKey, "webgpu" | "wasm">>>({});

  // The worker (and its WebAssembly runtime) starts only when it's needed:
  // on the Android app captions normally run natively instead.
  useEffect(() => () => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  const runWorker = useCallback(
    (type: "load" | "transcribe", audio?: Float32Array, options: TranscribeOptions = {}): Promise<{ text?: string; chunks?: WorkerChunk[] }> => {
      workerRef.current ??= new Worker(new URL("../../../workers/whisper-worker.ts", import.meta.url), { type: "module" });
      const worker = workerRef.current;
      const requestId = crypto.randomUUID();
      const markReady = (backend: unknown) => {
        setWorkerState("ready");
        setReadyModels((current) => new Set(current).add(selectedModel));
        if (backend === "webgpu" || backend === "wasm") setModelBackends((current) => ({ ...current, [selectedModel]: backend }));
        setProgress(1);
      };
      return new Promise((resolve, reject) => {
        const handleMessage = (event: MessageEvent<Record<string, unknown>>) => {
          if (event.data.requestId !== requestId) return;
          const messageType = event.data.type;
          if (messageType === "model-progress") {
            setWorkerState("loading");
            const rawProgress = Number(event.data.progress ?? 0);
            setProgress(rawProgress > 1 ? rawProgress / 100 : rawProgress);
            setProgressMessage("Getting captions ready…");
          } else if (messageType === "transcription-progress") {
            setWorkerState("ready");
            setProgress(Number(event.data.progress ?? 0));
            setProgressMessage("Listening for words…");
          } else if (messageType === "ready") {
            worker.removeEventListener("message", handleMessage);
            markReady(event.data.backend);
            setProgressMessage("Captions are ready");
            resolve({});
          } else if (messageType === "result") {
            worker.removeEventListener("message", handleMessage);
            markReady(event.data.backend);
            resolve({ text: String(event.data.text ?? ""), chunks: (event.data.chunks ?? []) as WorkerChunk[] });
          } else if (messageType === "error") {
            worker.removeEventListener("message", handleMessage);
            reject(new Error(String(event.data.message ?? "Local transcription failed.")));
          }
        };
        worker.addEventListener("message", handleMessage);
        const message = { requestId, type, language: options.language, task: options.task, model: selectedModel };
        if (audio) worker.postMessage({ ...message, audio }, [audio.buffer]);
        else worker.postMessage(message);
      });
    },
    [selectedModel],
  );

  const changeModel = useCallback(
    (value: string) => {
      if (!isWhisperModelKey(value)) return;
      const ready = readyModels.has(value);
      setSelectedModel(value);
      setProgress(ready ? 1 : 0);
      setProgressMessage(ready ? "Captions are ready" : "");
      setWorkerState(ready ? "ready" : "idle");
    },
    [readyModels],
  );

  const prepareModel = useCallback(async () => {
    setWorkerState("loading");
    setProgress(0);
    setProgressMessage("Getting captions ready…");
    if (await nativeWhisperAvailable()) {
      // Built into the app: the model loads when the first clip is transcribed.
      setWorkerState("ready");
      setReadyModels((current) => new Set(current).add(selectedModel));
      setProgress(1);
      setProgressMessage("Captions are ready");
      return;
    }
    try {
      await runWorker("load");
    } catch (reason) {
      setWorkerState("idle");
      throw reason;
    }
  }, [runWorker, selectedModel]);

  /** Read one clip's sound and return its captions, timed on the timeline. Throws when nothing is said. */
  const transcribeClip = useCallback(
    async (clip: Clip, mediaItem: MediaItem, options: TranscribeOptions = {}): Promise<TranscriptionSegment[]> => {
      setProgress(0);
      setProgressMessage("Reading the sound…");
      let audioContext: AudioContext | null = null;
      try {
        const sourceBlob = mediaItem.blob ?? (mediaItem.fileHandle ? await mediaItem.fileHandle.getFile() : null);
        if (!sourceBlob) throw new Error("Reconnect the source media before creating captions.");
        audioContext = new AudioContext();
        const audioBuffer = await loadAudioBuffer(audioContext, sourceBlob, {
          audioTrackIndex: clip.audioTrackIndex,
          onProgress: (next) => {
            setProgress(next.progress * 0.18);
            setProgressMessage("Reading the sound…");
          },
        });
        if (!audioBuffer) throw new Error("The clip's audio could not be decoded.");

        const sourceStart = Math.max(0, clip.inPoint ?? 0);
        const sourceEnd = Math.min(
          audioBuffer.duration,
          clip.outPoint > sourceStart ? clip.outPoint : sourceStart + clip.duration * Math.max(clip.speed ?? 1, 0.01),
        );
        const samples = emphasizeSpeech(audioBufferToWhisperSamples(audioBuffer, sourceStart, sourceEnd));
        setProgress(0.2);
        setProgressMessage(workerState === "ready" ? "Listening for words…" : "Getting captions ready…");
        let result: { text?: string; chunks?: WorkerChunk[] } | null = null;
        if (await nativeWhisperAvailable()) {
          setProgressMessage("Listening for words…");
          try {
            result = await transcribeNatively(samples, options, (next) => setProgress(0.2 + next * 0.8));
          } catch (error) {
            // A phone the native build can't handle still gets captions, just slower.
            console.warn("[Captions] Native captions failed, using the web worker:", error);
          }
        }
        result ??= await runWorker("transcribe", samples, options);
        const sourceDuration = Math.max(0.1, sourceEnd - sourceStart);
        const playbackSpeed = Math.max(clip.speed ?? 1, 0.01);
        const clipEndTime = clip.startTime + clip.duration;
        const segments: TranscriptionSegment[] = (result.chunks ?? [])
          .map((chunk) => {
            const start = Math.max(0, chunk.timestamp?.[0] ?? 0);
            const end = Math.min(sourceDuration, chunk.timestamp?.[1] ?? Math.min(sourceDuration, start + 3));
            return {
              text: stripNonSpeech(chunk.text),
              startTime: Math.min(clipEndTime, clip.startTime + start / playbackSpeed),
              endTime: Math.min(clipEndTime, clip.startTime + Math.max(start + 0.1, end) / playbackSpeed),
              confidence: 1,
            };
          })
          .filter((segment) => segment.text.length > 0 && segment.endTime > segment.startTime);
        const wholeText = stripNonSpeech(result.text ?? "");
        if (segments.length === 0 && wholeText) {
          segments.push({ text: wholeText, startTime: clip.startTime, endTime: clipEndTime, confidence: 1 });
        }
        if (segments.length === 0) throw new Error("No speech was detected in the clip.");
        return segments;
      } finally {
        await audioContext?.close().catch(() => undefined);
      }
    },
    [runWorker, selectedModel, workerState],
  );

  return {
    workerState,
    progress,
    progressMessage,
    setProgressMessage,
    selectedModel,
    readyModels,
    modelBackends,
    changeModel,
    prepareModel,
    transcribeClip,
  };
}
