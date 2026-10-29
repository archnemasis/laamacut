import { dialog, shell, BrowserWindow } from "electron";
import { promises as fs } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";

export class FileWriterRegistry {
  private handles = new Map<string, FileHandle>();
  private paths = new Map<string, string>();

  async open(path: string): Promise<string> {
    const id = randomUUID();
    this.handles.set(id, await fs.open(path, "w"));
    this.paths.set(id, path);
    return id;
  }

  async writeChunk(id: string, data: ArrayBuffer | Uint8Array, position: number): Promise<void> {
    const fh = this.handles.get(id);
    if (!fh) throw new Error(`unknown write handle ${id}`);
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    await fh.write(bytes, 0, bytes.byteLength, position);
  }

  async close(id: string): Promise<void> {
    const fh = this.handles.get(id);
    if (!fh) return;
    await fh.close();
    this.handles.delete(id);
    this.paths.delete(id);
  }

  async abort(id: string): Promise<void> {
    const fh = this.handles.get(id);
    const p = this.paths.get(id);
    if (fh) await fh.close();
    this.handles.delete(id);
    this.paths.delete(id);
    if (p) await fs.rm(p, { force: true });
  }
}

export const fileWriters = new FileWriterRegistry();

/**
 * Paths the renderer may touch: ones the user picked in a file dialog this
 * session, and temp files main made. The renderer cannot name any other file,
 * so a compromised page cannot read or overwrite the rest of the disk.
 */
export class PathGrants {
  private granted = new Set<string>();

  private key(p: string): string {
    const resolved = path.resolve(p);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  }

  grant(p: string): string {
    this.granted.add(this.key(p));
    return p;
  }

  has(p: string): boolean {
    return typeof p === "string" && path.isAbsolute(p) && this.granted.has(this.key(p));
  }

  require(p: string): string {
    if (!this.has(p)) throw new Error("[fs] path was not chosen by the user");
    return p;
  }
}

export const pathGrants = new PathGrants();

/** Project files can be reopened from Recent projects after a restart, so these extensions stay allowed. */
const PROJECT_EXTENSIONS = new Set([".oreel", ".json"]);

export function requireProjectPath(p: string): string {
  if (pathGrants.has(p)) return p;
  if (path.isAbsolute(p) && PROJECT_EXTENSIONS.has(path.extname(p).toLowerCase())) return p;
  throw new Error("[fs] not a project file the user chose");
}

export async function showSaveDialog(args: {
  defaultPath: string;
  filters: { name: string; extensions: string[] }[];
}): Promise<string | null> {
  const win = BrowserWindow.getFocusedWindow() ?? undefined;
  const res = await dialog.showSaveDialog(win!, {
    defaultPath: args.defaultPath,
    filters: args.filters,
  });
  return res.canceled || !res.filePath ? null : pathGrants.grant(res.filePath);
}

export async function showOpenDialog(args: {
  filters: { name: string; extensions: string[] }[];
}): Promise<string | null> {
  const win = BrowserWindow.getFocusedWindow() ?? undefined;
  const res = await dialog.showOpenDialog(win!, {
    filters: args.filters,
    properties: ["openFile"],
  });
  return res.canceled || res.filePaths.length === 0 ? null : pathGrants.grant(res.filePaths[0]);
}

export async function readTextFile(args: { path: string }): Promise<string> {
  return fs.readFile(requireProjectPath(args.path), "utf8");
}

export async function readFileBytes(args: { path: string }): Promise<ArrayBuffer> {
  const buf = await fs.readFile(pathGrants.require(args.path));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

export async function writeTextFile(args: { path: string; data: string }): Promise<void> {
  await fs.writeFile(requireProjectPath(args.path), args.data, "utf8");
}

export async function revealInFolder(args: { path: string }): Promise<void> {
  shell.showItemInFolder(pathGrants.require(args.path));
}

export async function tempFilePath(args: { ext: string }): Promise<string> {
  const safeExt = args.ext.replace(/[^a-zA-Z0-9]/g, "") || "bin";
  return pathGrants.grant(path.join(os.tmpdir(), `openreel-mat-${randomUUID()}.${safeExt}`));
}
