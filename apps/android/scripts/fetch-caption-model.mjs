// Gets what the phone's auto captions need before building the APK:
//  - the Whisper Tiny model in whisper.cpp's format (5-bit, 31 MB), put into
//    the APK's assets so captions work on first use and offline;
//  - the whisper.cpp source, which Gradle builds into the app (see
//    app/src/main/cpp/CMakeLists.txt) so captions run natively, not in the
//    web view.
// Files already downloaded are kept.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "..", "android", "app", "src");

const WHISPER_CPP_VERSION = "1.7.4";
const MODEL = {
  file: "ggml-tiny-q5_1.bin",
  url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny-q5_1.bin",
  size: 32152673,
  sha256: "818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7",
};

const exists = (path) => stat(path).then((s) => s.size > 0, () => false);

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

const modelPath = join(app, "models", "whisper", MODEL.file);
if (!(await exists(modelPath))) {
  console.log(`Downloading ${MODEL.file}`);
  const data = await download(MODEL.url);
  if (data.length !== MODEL.size) throw new Error(`${MODEL.file}: expected ${MODEL.size} bytes, got ${data.length}`);
  const digest = createHash("sha256").update(data).digest("hex");
  if (digest !== MODEL.sha256) throw new Error(`${MODEL.file}: checksum ${digest} does not match`);
  await mkdir(dirname(modelPath), { recursive: true });
  await writeFile(modelPath, data);
}

const sourceDir = join(app, "main", "cpp", "whisper.cpp");
const versionFile = join(sourceDir, ".laamacut-version");
const haveVersion = await readFile(versionFile, "utf8").then((v) => v.trim(), () => "");
if (haveVersion !== WHISPER_CPP_VERSION) {
  console.log(`Downloading whisper.cpp ${WHISPER_CPP_VERSION}`);
  const tarball = await download(`https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v${WHISPER_CPP_VERSION}.tar.gz`);
  const work = join(app, "main", "cpp", ".download");
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });
  const archive = join(work, "whisper.tar.gz");
  await writeFile(archive, tarball);
  execFileSync("tar", ["-xzf", "whisper.tar.gz"], { cwd: work, stdio: "inherit" });
  await rm(sourceDir, { recursive: true, force: true });
  await rename(join(work, `whisper.cpp-${WHISPER_CPP_VERSION}`), sourceDir);
  await rm(work, { recursive: true, force: true });
  await writeFile(versionFile, WHISPER_CPP_VERSION);
}

console.log("Caption model and whisper.cpp ready");
