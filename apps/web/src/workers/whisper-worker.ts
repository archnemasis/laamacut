/// <reference lib="webworker" />

import { env, pipeline } from "@huggingface/transformers";
import {
  DEFAULT_WHISPER_MODEL,
  WHISPER_MODELS,
  isWhisperModelKey,
  type WhisperModelKey,
} from "./whisper-models";

const MODEL_HOST = "https://media.openreel.video/models/";

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.remoteHost = MODEL_HOST;
env.remotePathTemplate = "{model}/resolve/{revision}/";
env.useBrowserCache = true;

interface WhisperOutput {
  text: string;
  chunks?: Array<{
    text: string;
    timestamp: [number | null, number | null];
  }>;
}

type WhisperPipeline = (
  audio: Float32Array,
  options: Record<string, unknown>,
) => Promise<WhisperOutput | WhisperOutput[]>;
const createPipeline = pipeline as unknown as (
  task: string,
  model: string,
  options: Record<string, unknown>,
) => Promise<WhisperPipeline>;
interface LoadedWhisperModel {
  readonly transcriber: WhisperPipeline;
  readonly backend: "webgpu" | "wasm";
}

const transcriberPromises = new Map<
  WhisperModelKey,
  Promise<LoadedWhisperModel>
>();

function post(requestId: string, payload: Record<string, unknown>): void {
  self.postMessage({ requestId, ...payload });
}

function progressCallback(requestId: string) {
  return (event: Record<string, unknown>) => {
    post(requestId, {
      type: "model-progress",
      status: event.status,
      file: event.file,
      progress: event.progress,
      loaded: event.loaded,
      total: event.total,
    });
  };
}

/** Where the Android app keeps its built-in copy of the fast model (see fetch-caption-model.mjs). */
const BUNDLED_PATH = "/models/";

/** True when this app was installed with the model built in (the Android app). */
async function hasBundledModel(modelId: string): Promise<boolean> {
  try {
    const response = await fetch(`${BUNDLED_PATH}${modelId}/config.json`);
    return response.ok && (response.headers.get("content-type") ?? "").includes("json");
  } catch {
    return false;
  }
}

async function createWhisperModel(
  requestId: string,
  modelKey: WhisperModelKey,
): Promise<LoadedWhisperModel> {
  const modelId = WHISPER_MODELS[modelKey].id;
  if (modelKey === "fast" && (await hasBundledModel(modelId))) {
    // Built into the app: nothing to download, works offline.
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    env.localModelPath = BUNDLED_PATH;
    const wasm = env.backends.onnx.wasm;
    if (wasm) wasm.wasmPaths = `${BUNDLED_PATH}ort/`;
    const transcriber = await createPipeline("automatic-speech-recognition", modelId, {
      device: "wasm",
      dtype: "q8",
      progress_callback: progressCallback(requestId),
    });
    return { transcriber, backend: "wasm" };
  }
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  const canUseWebGPU = modelKey === "accurate" && "gpu" in navigator;

  if (canUseWebGPU) {
    try {
      const transcriber = await createPipeline(
        "automatic-speech-recognition",
        modelId,
        {
          device: "webgpu",
          dtype: "q4",
          progress_callback: progressCallback(requestId),
        },
      );
      return { transcriber, backend: "webgpu" };
    } catch (error) {
      console.warn("[Whisper] WebGPU unavailable; falling back to WASM", error);
    }
  }

  const transcriber = await createPipeline(
    "automatic-speech-recognition",
    modelId,
    {
      device: "wasm",
      dtype: "q4",
      progress_callback: progressCallback(requestId),
    },
  );
  return { transcriber, backend: "wasm" };
}

function loadModel(
  requestId: string,
  modelKey: WhisperModelKey,
): Promise<LoadedWhisperModel> {
  let modelPromise = transcriberPromises.get(modelKey);
  if (!modelPromise) {
    modelPromise = createWhisperModel(requestId, modelKey);
    transcriberPromises.set(modelKey, modelPromise);
    modelPromise.catch(() => {
      transcriberPromises.delete(modelKey);
    });
  }
  return modelPromise;
}

self.onmessage = async (
  event: MessageEvent<{
    requestId: string;
    type: "load" | "transcribe";
    audio?: Float32Array;
    language?: string;
    model?: WhisperModelKey;
  }>,
) => {
  const { requestId, type, audio, language } = event.data;
  const modelKey = isWhisperModelKey(event.data.model)
    ? event.data.model
    : DEFAULT_WHISPER_MODEL;
  try {
    const { transcriber, backend } = await loadModel(requestId, modelKey);
    if (type === "load") {
      post(requestId, { type: "ready", model: modelKey, backend });
      return;
    }
    if (!audio?.length) throw new Error("The selected clip has no decodable audio.");

    post(requestId, { type: "transcription-progress", progress: 0.05 });
    const output = await transcriber(audio, {
      language,
      task: "transcribe",
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
    });
    const result = Array.isArray(output) ? output[0] : output;
    post(requestId, {
      type: "result",
      text: result.text,
      chunks: result.chunks ?? [],
      model: modelKey,
      backend,
    });
  } catch (error) {
    post(requestId, {
      type: "error",
      message: error instanceof Error ? error.message : "Local transcription failed.",
    });
  }
};

export {};
