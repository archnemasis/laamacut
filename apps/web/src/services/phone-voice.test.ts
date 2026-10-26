import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PHONE_VOICE, speak } from "./phone-voice";

const reply = (status: number, body: unknown) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

describe("speak", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to Adam and asks ElevenLabs directly with the key", async () => {
    const fetch = vi.fn(async () => new Response(new Blob(["mp3"]), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    expect(DEFAULT_PHONE_VOICE.name).toBe("Adam");
    const audio = await speak("Hello there", DEFAULT_PHONE_VOICE.id, "sk_test");
    expect(audio.type).toBe("audio/mpeg");
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.elevenlabs.io/v1/text-to-speech/pNInz6obpgDQGcFmaJgB");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("sk_test");
    expect(JSON.parse(init.body as string).text).toBe("Hello there");
  });

  it.each([
    [401, { detail: { status: "invalid_api_key" } }, /key didn't work/],
    [401, { detail: { status: "detected_unusual_activity" } }, /VPN/],
    [401, { detail: { status: "quota_exceeded" } }, /key didn't work/],
    [400, { detail: { status: "quota_exceeded", message: "x" } }, /free speech/],
  ])("explains a %i error plainly", async (status, body, message) => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(status, body)));
    await expect(speak("Hi", "v", "k")).rejects.toThrow(message);
  });

  it("says when there's no internet", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(speak("Hi", "v", "k")).rejects.toThrow(/internet/);
  });
});
