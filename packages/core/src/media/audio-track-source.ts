/**
 * A file that can hand over its sound on its own, such as a phone gallery
 * video read from storage: decoding just its audio track avoids reading
 * (and holding) the whole video file.
 */
export interface AudioTrackSource {
  /** The file's first audio track as a small audio file, or null when it has no sound. */
  loadAudioTrack(): Promise<Blob | null>;
}

export function hasAudioTrackSource(blob: Blob): blob is Blob & AudioTrackSource {
  return typeof (blob as Partial<AudioTrackSource>).loadAudioTrack === "function";
}

/**
 * The bytes to give decodeAudioData for a file's sound: just its audio track
 * when the file can provide it, otherwise the whole file.
 */
export async function audioDataOf(blob: Blob): Promise<ArrayBuffer> {
  if (hasAudioTrackSource(blob)) {
    const track = await blob.loadAudioTrack();
    if (!track) throw new Error("This video has no sound.");
    return track.arrayBuffer();
  }
  return blob.arrayBuffer();
}
