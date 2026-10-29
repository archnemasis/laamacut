/// <reference lib="webworker" />

/**
 * Encodes pictures to PNG off the main thread. On the main thread Chromium
 * only encodes once the page is idle, which during an export meant waiting
 * about four seconds per picture; this worker is always idle.
 */
self.onmessage = async (event: MessageEvent<{ id: number; bitmap: ImageBitmap }>) => {
  const { id, bitmap } = event.data;
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not draw text");
    ctx.drawImage(bitmap, 0, 0);
    const buffer = await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer();
    self.postMessage({ id, buffer }, { transfer: [buffer] });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  } finally {
    bitmap.close();
  }
};
