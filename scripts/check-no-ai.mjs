import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

/**
 * Laamacut ships no AI features apart from two the user chose: ElevenLabs text
 * to speech (the user's own key) and local Whisper auto captions. This check
 * fails if AI models, AI services or the removed AI editor creep back in.
 */
const root = resolve(import.meta.dirname, "..");
// Every app and package in the repo is part of Laamacut, so all of them are checked.
const sourceRoots = ["apps", "packages", "scripts"].map((path) => join(root, path));
const sourceExtensions = new Set([".cjs", ".html", ".java", ".js", ".json", ".jsonc", ".jsx", ".kt", ".mjs", ".ts", ".tsx"]);
// Build output, installed packages, and generated copies (the Android copy of
// the web build and the downloaded caption model) are not source.
const ignoredDirectories = new Set(["build", "dist", "node_modules", "out", ".gradle", ".wrangler"]);
const ignoredPaths = new Set([
  "apps/android/android/app/src/main/assets/public",
  "apps/android/android/app/src/models",
  "apps/desktop/release",
]);
const forbidden = [
  /@mediapipe\//,
  /onnxruntime/,
  /@openreel\/(?:agent|agent-runner|creation-agent)\b/,
  /@imgly\/background-removal/,
  /api\.openai\.com/,
  /api\.anthropic\.com/,
  /(?:openai|anthropic)-compatible/,
  /generativelanguage\.googleapis\.com/,
  /mediapipe-models/,
  /\bkie\.ai\b|\bKieAI\b/,
  /\bfreepik\b/i,
  /env\.AI\.run|"ai":\s*\{/,
];
// Whisper auto captions are allowed, so its runtime may appear only where it is used.
const whisperRuntime = /@huggingface\/transformers/;
const whisperFiles = new Set([
  "apps/web/src/workers/whisper-worker.ts",
  "apps/web/package.json",
  "apps/android/scripts/fetch-caption-model.mjs",
]);
// This file names the forbidden patterns, so it is not checked against them.
const self = "scripts/check-no-ai.mjs";

function walk(path) {
  if (!existsSync(path)) return [];
  const entries = readdirSync(path, { withFileTypes: true, recursive: false });
  return entries.flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      const name = relative(root, child).replaceAll("\\", "/");
      return ignoredDirectories.has(entry.name) || ignoredPaths.has(name) ? [] : walk(child);
    }
    return entry.isFile() && sourceExtensions.has(extname(entry.name)) ? [child] : [];
  });
}

const files = sourceRoots.flatMap(walk);
const failures = [];
for (const file of files) {
  const name = relative(root, file).replaceAll("\\", "/");
  // Tests may name removed features to prove old settings are cleaned up.
  if (/\.test\.tsx?$/.test(file) || name === self) continue;
  const contents = readFileSync(file, "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(contents)) failures.push(`${name} matches ${pattern}`);
  }
  if (whisperRuntime.test(contents) && !whisperFiles.has(name)) {
    failures.push(`${name} uses the Whisper runtime outside the caption worker`);
  }
}

if (failures.length > 0) {
  console.error("No-AI check failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(`No-AI check passed (${files.length} files scanned).`);
