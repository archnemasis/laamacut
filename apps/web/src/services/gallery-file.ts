import type { MediaItem } from "@openreel/core";
import type { AudioTrackSource } from "@openreel/core/media";
import { galleryOriginal } from "./gallery-originals";

/** Served by MediaServer.java, reading straight from the phone's storage. */
const MEDIA_PATH = "/_laamacut_media_/";

export interface GalleryFileSource {
  uri: string;
  name: string;
  mime: string;
  size: number;
}

export function galleryMediaUrl(source: Pick<GalleryFileSource, "uri" | "name">): string {
  const origin = typeof location !== "undefined" ? location.origin : "";
  return `${origin}${MEDIA_PATH}${encodeURIComponent(source.name)}?uri=${encodeURIComponent(source.uri)}`;
}

/** Each video's sound is pulled out once, then reused by everything that plays or reads it. */
const audioTracks = new Map<string, Promise<Blob | null>>();

/**
 * A gallery video the editor treats as an ordinary File, without copying it
 * into memory: every read asks the phone for just the bytes needed (an HTTP
 * range from the media server). Opening a clip is instant whatever its size,
 * like CapCut. Its `url` plays in <video> directly, and its sound can be
 * pulled out on its own (loadAudioTrack). Saved projects keep the gallery
 * uri, not the bytes.
 */
export class GalleryFile extends File implements AudioTrackSource {
  readonly source: GalleryFileSource;
  readonly url: string;
  private readonly from: number;
  private readonly to: number;

  constructor(source: GalleryFileSource, from = 0, to = source.size, type = source.mime) {
    super([], source.name, { type });
    this.source = source;
    this.url = galleryMediaUrl(source);
    this.from = from;
    this.to = Math.max(from, to);
    // File's own size is the (empty) bytes it was built from; report the real one.
    Object.defineProperty(this, "size", { value: this.to - this.from });
  }

  private range(): HeadersInit {
    return { Range: `bytes=${this.from}-${this.to - 1}` };
  }

  override slice(start = 0, end = this.size, contentType?: string): Blob {
    const clamp = (value: number) => Math.min(this.size, Math.max(0, value < 0 ? this.size + value : value));
    const from = this.from + clamp(start);
    return new GalleryFile(this.source, from, Math.max(from, this.from + clamp(end)), contentType ?? this.type);
  }

  override stream(): ReadableStream<Uint8Array<ArrayBuffer>> {
    if (this.size === 0) return new ReadableStream({ start: (controller) => controller.close() });
    const abort = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>> | null = null;
    return new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull: async (controller) => {
        if (!reader) {
          const response = await fetch(this.url, { headers: this.range(), signal: abort.signal });
          if (!response.ok || !response.body) throw new Error(`Could not read ${this.name}`);
          reader = response.body.getReader() as ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>;
        }
        const { done, value } = await reader.read();
        if (done) controller.close();
        else controller.enqueue(value);
      },
      cancel: () => {
        abort.abort();
        void reader?.cancel().catch(() => undefined);
      },
    });
  }

  override async arrayBuffer(): Promise<ArrayBuffer> {
    if (this.size === 0) return new ArrayBuffer(0);
    const response = await fetch(this.url, { headers: this.range() });
    if (!response.ok) throw new Error(`Could not read ${this.name}`);
    return response.arrayBuffer();
  }

  override async bytes(): Promise<Uint8Array<ArrayBuffer>> {
    return new Uint8Array(await this.arrayBuffer());
  }

  override async text(): Promise<string> {
    return new TextDecoder().decode(await this.arrayBuffer());
  }

  /** The video's sound as a small .m4a, copied out by the phone without re-encoding. */
  loadAudioTrack(): Promise<Blob | null> {
    let track = audioTracks.get(this.source.uri);
    if (!track) {
      track = extractAudioTrack(this.source.uri);
      audioTracks.set(this.source.uri, track);
      track.catch(() => audioTracks.delete(this.source.uri));
    }
    return track;
  }
}

async function extractAudioTrack(uri: string): Promise<Blob | null> {
  const gallery = window.Capacitor?.Plugins?.LaamacutGallery;
  const convert = window.Capacitor?.convertFileSrc;
  if (!gallery || !convert) throw new Error("Gallery sound is only available in the Android app");
  const { path } = await gallery.extractAudio({ uri });
  if (!path) return null;
  const response = await fetch(convert(path));
  if (!response.ok) throw new Error("Could not read the video's sound");
  return new Blob([await response.blob()], { type: "audio/mp4" });
}

/**
 * Object URLs of a GalleryFile would point at its (empty) File bytes, so they
 * go to the media server instead. Installed once at startup.
 */
export function installGalleryFileUrls(): void {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function" || (URL.createObjectURL as { gallery?: boolean }).gallery) return;
  const create = URL.createObjectURL.bind(URL);
  const patched = (object: Blob | MediaSource) => (object instanceof GalleryFile && object.size === object.source.size ? object.url : create(object));
  (patched as { gallery?: boolean }).gallery = true;
  URL.createObjectURL = patched;
}

/**
 * A saved clip's gallery video, read from storage again when the project is
 * reopened (the project keeps where the video is, not a copy of it).
 */
export function restoreGalleryFile(item: MediaItem): GalleryFile | undefined {
  const original = galleryOriginal(item.id);
  if (!original || original.copy !== false || item.type !== "video" || !window.Capacitor?.convertFileSrc) return undefined;
  return new GalleryFile({ uri: original.uri, name: original.name, mime: original.mime, size: item.metadata.fileSize });
}
