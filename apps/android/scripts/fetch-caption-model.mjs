// Puts the auto-captions model (Whisper Tiny, 8-bit) and the ONNX runtime it
// runs on into the APK's assets, so captions work on first use and offline.
// The app serves them at https://localhost/models/. Run before building the APK;
// files already downloaded are kept.
import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
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

// The runtime ships with the web app's transformers package.
const require = createRequire(join(here, "..", "..", "web", "package.json"));
const dist = dirname(require.resolve("@huggingface/transformers"));
await mkdir(join(out, "ort"), { recursive: true });
for (const file of ["ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm"]) {
  await copyFile(join(dist, file), join(out, "ort", file));
}
console.log(`Caption model ready in ${out}`);
