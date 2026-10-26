/**
 * CapCut's "Text to speech" for the phone. The voices are ElevenLabs' stock
 * voices (CapCut's well-known "Adam" is ElevenLabs' Adam), called straight
 * from the phone with the user's own key. A free ElevenLabs account covers
 * about 10 minutes of speech a month.
 */

export interface PhoneVoice {
  id: string;
  name: string;
  description: string;
}

export const PHONE_VOICES: PhoneVoice[] = [
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", description: "Deep narrator" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", description: "Young, warm" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni", description: "Calm, smooth" },
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", description: "Clear, friendly" },
];

export const DEFAULT_PHONE_VOICE = PHONE_VOICES[0];

/** Where to make a free key: sign up, then Profile → API keys. */
export const ELEVENLABS_KEYS_URL = "https://elevenlabs.io/app/settings/api-keys";

const API = "https://api.elevenlabs.io/v1";
const MODEL = "eleven_multilingual_v2";

/** Turn ElevenLabs' error replies into something a person can act on. */
async function speechError(response: Response): Promise<Error> {
  const body = (await response.json().catch(() => ({}))) as { detail?: { status?: string; message?: string } | string };
  const detail = typeof body.detail === "string" ? { message: body.detail } : body.detail ?? {};
  if (response.status === 401) {
    if (detail.status === "detected_unusual_activity") {
      return new Error("ElevenLabs paused free use on this account. Turning off any VPN usually fixes it.");
    }
    if (detail.status === "missing_permissions") {
      return new Error("This key isn't allowed to make speech. Turn on Text to Speech for it on elevenlabs.io.");
    }
    return new Error("That key didn't work. Check it on elevenlabs.io and paste it again.");
  }
  if (detail.status === "quota_exceeded" || response.status === 402) {
    return new Error("You've used this month's free speech. It refills at the start of your next ElevenLabs month.");
  }
  return new Error(detail.message ?? `ElevenLabs couldn't make the speech (${response.status}).`);
}

/** Speak `text` in a voice; resolves to an MP3. */
export async function speak(text: string, voiceId: string, apiKey: string, signal?: AbortSignal): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(`${API}/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "audio/mpeg", "xi-api-key": apiKey },
      body: JSON.stringify({ text, model_id: MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("Couldn't reach ElevenLabs. Check your internet connection.");
  }
  if (!response.ok) throw await speechError(response);
  return new Blob([await response.blob()], { type: "audio/mpeg" });
}

// On the phone the key goes to the Android Keystore (see SecretsPlugin.java):
// it is encrypted with a key held in the phone's secure hardware that can't be
// read out. Without that bridge (a browser) it falls back to a non-extractable
// WebCrypto key kept beside it in IndexedDB.
interface SecretsPlugin {
  set(options: { name: string; value: string }): Promise<void>;
  get(options: { name: string }): Promise<{ value?: string }>;
  remove(options: { name: string }): Promise<void>;
}
const nativeSecrets = (): SecretsPlugin | undefined =>
  typeof window !== "undefined"
    ? (window as unknown as { Capacitor?: { Plugins?: { LaamacutSecrets?: SecretsPlugin } } }).Capacitor?.Plugins?.LaamacutSecrets
    : undefined;

const DB_NAME = "laamacut-voice";
const STORE = "kv";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = work(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function deviceKey(): Promise<CryptoKey> {
  const existing = await run<CryptoKey | undefined>("readonly", (s) => s.get("device-key"));
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await run("readwrite", (s) => s.put(key, "device-key"));
  return key;
}

export async function saveVoiceKey(apiKey: string): Promise<void> {
  const native = nativeSecrets();
  if (native) {
    await native.set({ name: "elevenlabs", value: apiKey.trim() });
    return;
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await deviceKey(), new TextEncoder().encode(apiKey.trim()));
  await run("readwrite", (s) => s.put({ iv, data }, "elevenlabs"));
}

export async function loadVoiceKey(): Promise<string | null> {
  try {
    const native = nativeSecrets();
    if (native) return (await native.get({ name: "elevenlabs" })).value ?? null;
    const saved = await run<{ iv: Uint8Array<ArrayBuffer>; data: ArrayBuffer } | undefined>("readonly", (s) => s.get("elevenlabs"));
    if (!saved) return null;
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: saved.iv }, await deviceKey(), saved.data);
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

export async function forgetVoiceKey(): Promise<void> {
  const native = nativeSecrets();
  if (native) {
    await native.remove({ name: "elevenlabs" });
    return;
  }
  await run("readwrite", (s) => s.delete("elevenlabs"));
}
