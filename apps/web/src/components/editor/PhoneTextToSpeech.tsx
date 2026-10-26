import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AudioLines, ExternalLink, KeyRound, X } from "@/icons/lucide-compat";
import { useProjectStore } from "../../stores/project-store";
import { useTimelineStore } from "../../stores/timeline-store";
import { toast } from "../../stores/notification-store";
import {
  DEFAULT_PHONE_VOICE,
  ELEVENLABS_KEYS_URL,
  PHONE_VOICES,
  forgetVoiceKey,
  loadVoiceKey,
  saveVoiceKey,
  speak,
} from "../../services/phone-voice";

/** ElevenLabs takes up to 10,000 characters a go; this keeps one clip a sensible length. */
const MAX_CHARACTERS = 2500;

/** Where the preview ends, so the sheet rises up to meet it, like CapCut. */
function usePreviewBottom(): number | null {
  const [bottom, setBottom] = useState<number | null>(null);
  useLayoutEffect(() => {
    const preview = document.querySelector(".phone-preview");
    if (!preview) return;
    const measure = () => setBottom(preview.getBoundingClientRect().bottom);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(preview);
    return () => observer.disconnect();
  }, []);
  return bottom;
}

/**
 * CapCut's Text to speech: type a line, pick a voice (Adam by default) and
 * it lands on a new audio track at the playhead.
 */
export function PhoneTextToSpeech({ onClose }: { onClose: () => void }) {
  const previewBottom = usePreviewBottom();
  /** undefined while the saved key is being read. */
  const [apiKey, setApiKey] = useState<string | null | undefined>(undefined);
  const [keyDraft, setKeyDraft] = useState("");
  const [text, setText] = useState("");
  const [voiceId, setVoiceId] = useState(DEFAULT_PHONE_VOICE.id);
  const [working, setWorking] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    let live = true;
    void loadVoiceKey().then((key) => live && setApiKey(key));
    return () => {
      live = false;
      abort.current?.abort();
    };
  }, []);

  const saveKey = async () => {
    const key = keyDraft.trim();
    if (!key) return;
    try {
      await saveVoiceKey(key);
      setApiKey(key);
      setKeyDraft("");
    } catch {
      toast.error("Couldn't save the key", "Try again.");
    }
  };

  const changeKey = async () => {
    await forgetVoiceKey().catch(() => undefined);
    setApiKey(null);
  };

  const generate = async () => {
    const line = text.trim();
    if (!line || !apiKey || working) return;
    const voice = PHONE_VOICES.find((v) => v.id === voiceId) ?? DEFAULT_PHONE_VOICE;
    const at = useTimelineStore.getState().playheadPosition;
    abort.current = new AbortController();
    setWorking(true);
    try {
      const mp3 = await speak(line, voice.id, apiKey, abort.current.signal);
      const words = line.split(/\s+/).slice(0, 5).join(" ").replace(/[\\/:*?"<>|]/g, "");
      const file = new File([mp3], `${voice.name} - ${words}.mp3`, { type: "audio/mpeg" });
      const store = useProjectStore.getState();
      const imported = await store.importMedia(file);
      if (!imported.success || !imported.actionId) throw new Error("The speech was made but couldn't be added.");
      await useProjectStore.getState().addClipToNewTrack(imported.actionId, at);
      toast.success("Speech added", `${voice.name} is on the timeline.`);
      onClose();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Text to speech", error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <section
      role="dialog"
      aria-label="Text to speech"
      className="fixed inset-x-0 bottom-0 z-[120] flex flex-col rounded-t-2xl bg-[#1f1f1f] text-white"
      style={{ top: previewBottom ?? "45%" }}
    >
      <header className="relative flex h-14 shrink-0 items-center justify-center border-b border-white/10">
        <span className="text-[17px] font-semibold">Text to speech</span>
        <button type="button" aria-label="Close" onClick={onClose} className="absolute right-3 grid h-10 w-10 place-items-center">
          <X size={22} aria-hidden />
        </button>
      </header>

      {apiKey === null ? (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <div className="rounded-2xl bg-[#2a2a2a] p-4 text-[14px] leading-relaxed text-white/80">
            <p className="text-[15px] font-semibold text-white">Free voices, Adam included</p>
            <p className="mt-1">
              These are ElevenLabs voices. A free ElevenLabs account gives about 10 minutes of speech a month, no card needed.
            </p>
            <ol className="mt-3 list-decimal space-y-1 pl-5">
              <li>Sign up free at elevenlabs.io</li>
              <li>Open API keys and tap Create key</li>
              <li>Copy the key and paste it below</li>
            </ol>
            <button
              type="button"
              onClick={() => window.open(ELEVENLABS_KEYS_URL, "_blank")}
              className="mt-3 inline-flex items-center gap-2 font-semibold text-[#5ac8dc]"
            >
              Open elevenlabs.io <ExternalLink size={16} aria-hidden />
            </button>
          </div>
          <label className="block">
            <span className="mb-1.5 flex items-center gap-2 text-[14px] font-semibold">
              <KeyRound size={18} aria-hidden /> ElevenLabs API key
            </span>
            <input
              type="password"
              autoComplete="off"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder="sk_…"
              className="h-12 w-full rounded-xl bg-[#2a2a2a] px-4 text-[15px] outline-none focus:ring-2 focus:ring-[#5ac8dc]"
            />
          </label>
          <p className="text-[12px] text-white/50">Kept on this phone only, encrypted.</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <div className="relative">
            <textarea
              aria-label="Text to speak"
              value={text}
              maxLength={MAX_CHARACTERS}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type what you want said"
              rows={4}
              className="w-full resize-none rounded-2xl bg-[#2a2a2a] p-4 pb-7 text-[15px] outline-none focus:ring-2 focus:ring-[#5ac8dc]"
            />
            <span className="pointer-events-none absolute bottom-3 right-4 text-[12px] text-white/40">
              {text.length}/{MAX_CHARACTERS}
            </span>
          </div>
          <div role="radiogroup" aria-label="Voice" className="scrollbar-none flex gap-2 overflow-x-auto">
            {PHONE_VOICES.map((voice) => {
              const active = voice.id === voiceId;
              return (
                <label
                  key={voice.id}
                  className={`flex w-[86px] shrink-0 flex-col items-center gap-1 rounded-xl bg-[#2a2a2a] px-2 py-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-white ${active ? "ring-2 ring-white" : ""}`}
                >
                  <input
                    type="radio"
                    name="voice"
                    aria-label={`${voice.name}, ${voice.description}`}
                    className="sr-only"
                    checked={active}
                    onChange={() => setVoiceId(voice.id)}
                  />
                  <AudioLines size={22} aria-hidden className={active ? "text-[#5ac8dc]" : "text-white/70"} />
                  <span className="text-[14px] font-semibold">{voice.name}</span>
                  <span className="text-center text-[11px] leading-tight text-white/50">{voice.description}</span>
                </label>
              );
            })}
          </div>
          {apiKey && (
            <button type="button" onClick={() => void changeKey()} className="text-[13px] text-white/50 underline">
              Change ElevenLabs key
            </button>
          )}
        </div>
      )}

      <div className="shrink-0 p-4 pt-2">
        {apiKey === null ? (
          <button
            type="button"
            onClick={() => void saveKey()}
            disabled={!keyDraft.trim()}
            className="h-12 w-full rounded-2xl bg-[#5ac8dc] text-[17px] font-semibold text-black disabled:opacity-60"
          >
            Save key
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void generate()}
            disabled={!apiKey || !text.trim() || working}
            className="h-12 w-full rounded-2xl bg-[#5ac8dc] text-[17px] font-semibold text-black disabled:opacity-60"
          >
            {working ? "Making speech…" : "Add audio"}
          </button>
        )}
      </div>
    </section>
  );
}
