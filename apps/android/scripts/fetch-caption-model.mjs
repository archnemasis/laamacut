// Puts the auto-captions model (Whisper Tiny, 8-bit) into the APK's assets, so
// captions work on first use and offline. The ONNX runtime it runs on is
// already part of the web build.
// The app serves them at https://localhost/models/. Run before building the APK;
// files already downloaded are kept.
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "android", "app", "src", "models", "public", "models");
const MODEL = "onnx-community/whisper-tiny";
const FILES = [
  "config.json",
  "generation_config.json",
  "preprocessor_config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/encoder_model_quantized.onnx",
  "onnx/decoder_model_merged_quantized.onnx",
];

const exists = (path) => stat(path).then((s) => s.size > 0, () => false);

for (const file of FILES) {
  const target = join(out, MODEL, file);
  if (await exists(target)) continue;
  const url = `https://huggingface.co/${MODEL}/resolve/main/${file}`;
  console.log(`Downloading ${file}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
}

console.log(`Caption model ready in ${out}`);
