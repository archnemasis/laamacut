import { toast } from "../stores/notification-store";
import type { GalleryPlugin } from "./phone-gallery";

/**
 * Native file saver plugin of the Laamacut Android app (SaverPlugin.java).
 * Android's WebView ignores `<a download>` clicks, so files are streamed to it
 * in base64 chunks and written to Movies/Laamacut or Downloads/Laamacut.
 */
export interface AndroidSaver {
  begin(options: { filename: string; mimeType: string }): Promise<{ id: string }>;
  append(options: { id: string; data: string }): Promise<void>;
  finish(options: { id: string }): Promise<{ location: string }>;
  abort(options: { id: string }): Promise<void>;
}

declare global {
  interface Window {
    Capacitor?: {
      Plugins?: { LaamacutSaver?: AndroidSaver; LaamacutGallery?: GalleryPlugin };
      convertFileSrc?: (uri: string) => string;
    };
  }
}

const CHUNK_BYTES = 1024 * 1024;

export function getAndroidSaver(): AndroidSaver | undefined {
  return typeof window !== "undefined" ? window.Capacitor?.Plugins?.LaamacutSaver : undefined;
}

function readBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Stream a blob to the native saver; resolves to where it was saved. */
export async function saveBlobOnAndroid(saver: AndroidSaver, blob: Blob, filename: string): Promise<string> {
  const { id } = await saver.begin({ filename, mimeType: blob.type || "application/octet-stream" });
  try {
    for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES) {
      const chunk = new Uint8Array(await readBytes(blob.slice(offset, offset + CHUNK_BYTES)));
      await saver.append({ id, data: toBase64(chunk) });
    }
    const { location } = await saver.finish({ id });
    return location;
  } catch (error) {
    await saver.abort({ id }).catch(() => undefined);
    throw error;
  }
}

/** Route every `<a download>` click on a blob or data URL to the native saver. */
export function installAndroidDownloads(): void {
  const saver = getAndroidSaver();
  if (!saver) return;
  const nativeClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
    const href = this.href;
    if (!this.hasAttribute("download") || !/^(blob|data):/.test(href)) {
      nativeClick.call(this);
      return;
    }
    const filename = this.download || "laamacut-export";
    void fetch(href)
      .then((response) => response.blob())
      .then((blob) => saveBlobOnAndroid(saver, blob, filename))
      .then((location) => toast.success("Saved", `${filename} is in ${location}`))
      .catch((error: unknown) =>
        toast.error("Couldn't save the file", error instanceof Error ? error.message : String(error)),
      );
  };
}
