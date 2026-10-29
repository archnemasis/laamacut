import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { z } from "zod";
import { APP_ORIGIN } from "../protocol";

/** Only the app's own page (app://openreel) may call into main. */
export function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? "";
  if (!isAppUrl(url)) {
    throw new Error(`[ipc] rejected call from ${url || "unknown frame"}`);
  }
}

/** URL.origin is "null" for custom schemes like app://, so compare scheme and host. */
export function isAppUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}` === APP_ORIGIN;
  } catch {
    return false;
  }
}

export function handle<TSchema extends z.ZodTypeAny, TResult>(
  channel: string,
  schema: TSchema,
  fn: (args: z.output<TSchema>) => Promise<TResult> | TResult,
): void {
  ipcMain.handle(channel, async (event, raw) => {
    assertTrustedSender(event);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`[ipc] invalid payload for ${channel}: ${parsed.error.message}`);
    }
    return fn(parsed.data);
  });
}
