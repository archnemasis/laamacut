import { useLayoutEffect, useState } from "react";
import { SUBTITLE_STYLE_PRESETS, splitCaptionIntoSingleLineCues, type Clip, type MediaItem } from "@openreel/core";
import { Captions, Check, ChevronDown, ChevronRight, ChevronUp, Languages, Mic, Play, ScanText, Smile, Sparkles, X } from "@/icons/lucide-compat";
import { useProjectStore } from "../../stores/project-store";
import { useTimelineStore } from "../../stores/timeline-store";
import { toast } from "../../stores/notification-store";
import { CAPTION_LOOKS, DEFAULT_CAPTION_LOOK, captionFontSize, captionLookById } from "../../services/caption-looks";
import { addCaptionEmoji, removeFillerWords } from "../../services/caption-text";
import { CaptionLookPreview, CaptionPreviewKeyframes, useCaptionPreviewTick } from "./inspector/CaptionLookPreview";
import { useCaptionTranscriber } from "./inspector/use-caption-transcriber";

/** Where the speech comes from: the videos' own sound, the audio clips (voiceovers, music, extracted sound), or both. */
type Source = "both" | "video" | "audio";
type Picker = "source" | "language" | "translate" | "templates" | null;

const MAX_WORDS_PER_LINE = 5;

const LANGUAGES: { code: string; name: string }[] = [
  { code: "auto", name: "Auto detect" },
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "hi", name: "Hindi" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese" },
  { code: "ru", name: "Russian" },
  { code: "tr", name: "Turkish" },
  { code: "pl", name: "Polish" },
  { code: "vi", name: "Vietnamese" },
];

/** Whisper can only translate into English. */
const TRANSLATIONS = [
  { code: "none", name: "None" },
  { code: "en", name: "English" },
];

const SOURCE_NAMES: Record<Source, string> = { both: "Video & audio", video: "Video", audio: "Audio" };

/** The clips a source captions, in timeline order. Muted tracks are left out: nobody hears them. */
function sourceClips(source: Source): { clip: Clip; media: MediaItem }[] {
  const { project } = useProjectStore.getState();
  const mediaById = new Map(project.mediaLibrary.items.map((m) => [m.id, m] as const));
  const wanted = (type: string | undefined) =>
    (type === "video" && source !== "audio") || (type === "audio" && source !== "video");
  return project.timeline.tracks
    .flatMap((track) => (track.muted ? [] : track.clips))
    .map((clip) => ({ clip, media: mediaById.get(clip.mediaId) }))
    .filter((item): item is { clip: Clip; media: MediaItem } => wanted(item.media?.type))
    // A video and its linked audio clip are the same speech: caption it once.
    .filter((item, index, all) =>
      all.findIndex((other) => other.clip.mediaId === item.clip.mediaId && Math.abs(other.clip.startTime - item.clip.startTime) < 0.01) === index,
    )
    .sort((a, b) => a.clip.startTime - b.clip.startTime);
}

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
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  return bottom;
}

/** One of CapCut's rounded rows: an icon, a label and the current choice. */
function Row({ icon: Icon, label, value, onClick }: { icon: typeof Captions; label: string; value?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex h-14 w-full items-center gap-3 rounded-2xl bg-[#2a2a2a] px-4 text-left">
      <Icon size={20} aria-hidden />
      <span className="flex-1 text-[15px] font-semibold">{label}</span>
      {value && <span className="text-[14px] text-white/50">{value}</span>}
      <ChevronRight size={18} className="text-white/50" aria-hidden />
    </button>
  );
}

function Toggle({ icon: Icon, label, checked, onChange }: { icon: typeof Captions; label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="flex h-14 items-center gap-3 px-4">
      <Icon size={20} aria-hidden />
      <span className="flex-1 text-[15px] font-semibold">{label}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className={`relative h-7 w-12 rounded-full transition-colors ${checked ? "bg-[#5ac8dc]" : "bg-white/15"}`}>
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-[left] ${checked ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </label>
  );
}

/** A bottom sheet over the captions sheet, for choosing one option, like CapCut's Generate from. */
function ChoiceSheet({
  title,
  options,
  value,
  onPick,
  onClose,
}: {
  title: string;
  options: { code: string; name: string; icon?: typeof Captions; disabled?: boolean }[];
  value: string;
  onPick: (code: string) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState(value);
  return (
    <div className="absolute inset-0 z-10 flex flex-col justify-end bg-black/50" onClick={onClose}>
      <section role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()} className="max-h-[80%] rounded-t-2xl bg-[#1f1f1f] pb-4">
        <header className="relative flex h-14 items-center justify-center border-b border-white/10">
          <span className="text-[17px] font-semibold">{title}</span>
          <button type="button" aria-label="Close" onClick={onClose} className="absolute right-3 grid h-10 w-10 place-items-center">
            <X size={22} aria-hidden />
          </button>
        </header>
        <div role="radiogroup" aria-label={title} className="max-h-[50vh] space-y-2 overflow-y-auto p-4">
          {options.map((option) => (
            <button
              key={option.code}
              type="button"
              role="radio"
              aria-checked={picked === option.code}
              disabled={option.disabled}
              onClick={() => setPicked(option.code)}
              className="flex h-14 w-full items-center gap-3 rounded-2xl bg-[#2a2a2a] px-4 text-left disabled:opacity-40"
            >
              {option.icon && <option.icon size={20} aria-hidden />}
              <span className="flex-1 text-[16px] font-semibold">{option.name}</span>
              <span className={`grid h-6 w-6 place-items-center rounded-full ${picked === option.code ? "bg-[#5ac8dc] text-black" : "border-2 border-white/30"}`}>
                {picked === option.code && <Check size={14} strokeWidth={3} aria-hidden />}
              </span>
            </button>
          ))}
        </div>
        <div className="px-4">
          <button
            type="button"
            onClick={() => {
              onPick(picked);
              onClose();
            }}
            className="h-12 w-full rounded-2xl bg-[#5ac8dc] text-[16px] font-semibold text-black"
          >
            Done
          </button>
        </div>
      </section>
    </div>
  );
}

/**
 * CapCut's Auto captions sheet: pick where the speech comes from, the spoken
 * language, a caption template and extras, then Generate puts the captions
 * straight onto the timeline.
 */
export function PhoneAutoCaptions({ onClose }: { onClose: () => void }) {
  const addSubtitle = useProjectStore((s) => s.addSubtitle);
  const { progress, progressMessage, selectedModel, transcribeClip } = useCaptionTranscriber();
  const tick = useCaptionPreviewTick();
  const previewBottom = usePreviewBottom();
  const [source, setSource] = useState<Source>("both");
  const [language, setLanguage] = useState("auto");
  const [translate, setTranslate] = useState("none");
  const [lookId, setLookId] = useState(DEFAULT_CAPTION_LOOK.id);
  const [emojis, setEmojis] = useState(false);
  const [fillers, setFillers] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [picker, setPicker] = useState<Picker>(null);
  const [working, setWorking] = useState<string | null>(null);
  const hasVideo = sourceClips("video").length > 0;
  const hasAudio = sourceClips("audio").length > 0;

  const generate = async () => {
    const clips = sourceClips(source);
    if (clips.length === 0) {
      toast.error(
        "Nothing to caption",
        source === "video" ? "Add a video with sound first." : source === "audio" ? "Record a voiceover or add audio first." : "Add a video or audio first.",
      );
      return;
    }
    useTimelineStore.getState().pause();
    const look = captionLookById(lookId);
    const style = { ...SUBTITLE_STYLE_PRESETS.default, fontSize: captionFontSize(useProjectStore.getState().project.settings) };
    let added = 0;
    let lastError: unknown = null;
    try {
      for (let i = 0; i < clips.length; i++) {
        const { clip, media } = clips[i];
        setWorking(clips.length > 1 ? `Clip ${i + 1} of ${clips.length}` : "Generating captions");
        try {
          const segments = await transcribeClip(clip, media, {
            language: language === "auto" ? undefined : language,
            task: translate === "en" ? "translate" : "transcribe",
          });
          for (const segment of segments) {
            let text = fillers ? removeFillerWords(segment.text) : segment.text;
            if (!text) continue;
            for (const cue of splitCaptionIntoSingleLineCues(text, segment.startTime, segment.endTime, MAX_WORDS_PER_LINE)) {
              text = look.uppercase ? cue.text.toUpperCase() : cue.text;
              if (emojis) text = addCaptionEmoji(text);
              await addSubtitle(
                { id: `whisper-${crypto.randomUUID()}`, text, startTime: cue.startTime, endTime: cue.endTime, style },
                { captionSource: "whisper", captionSourceClipId: clip.id, captionMaxWordsPerLine: MAX_WORDS_PER_LINE, captionWhisperModel: selectedModel },
                look,
              );
              added += 1;
            }
          }
        } catch (error) {
          lastError = error;
        }
      }
    } finally {
      setWorking(null);
    }
    if (added > 0) {
      toast.success("Captions added", `${added} caption${added === 1 ? "" : "s"} on the timeline.`);
      onClose();
    } else {
      toast.error("No captions", lastError instanceof Error ? lastError.message : "No speech was found.");
    }
  };

  const languageName = LANGUAGES.find((l) => l.code === language)?.name ?? "Auto detect";
  const look = captionLookById(lookId);
  const tile = (id: string, big: boolean) => {
    const item = captionLookById(id);
    const active = lookId === id;
    return (
      <button
        key={id}
        type="button"
        role="radio"
        aria-checked={active}
        aria-label={item.label}
        onClick={() => setLookId(id)}
        className={`grid shrink-0 place-items-center overflow-hidden rounded-xl bg-[#2a2a2a] ${big ? "aspect-square text-[24px]" : "h-[86px] w-[86px] text-[14px]"} ${
          active ? "ring-2 ring-white" : ""
        }`}
      >
        <CaptionLookPreview look={item} tick={tick} />
      </button>
    );
  };

  return (
    <section
      role="dialog"
      aria-label="Auto captions"
      className="fixed inset-x-0 bottom-0 z-[120] flex flex-col rounded-t-2xl bg-[#1f1f1f] text-white"
      style={{ top: previewBottom ?? "50%" }}
    >
      <CaptionPreviewKeyframes />
      <header className="relative flex h-14 shrink-0 items-center justify-center border-b border-white/10">
        <span className="text-[17px] font-semibold">Auto captions</span>
        <button type="button" aria-label="Close" onClick={onClose} className="absolute right-3 grid h-10 w-10 place-items-center">
          <X size={22} aria-hidden />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <Row icon={ScanText} label="Generate from" value={SOURCE_NAMES[source]} onClick={() => setPicker("source")} />
        <Row icon={Languages} label="Spoken language" value={languageName} onClick={() => setPicker("language")} />

        <div className="rounded-2xl bg-[#2a2a2a] py-3">
          <button type="button" onClick={() => setPicker("templates")} className="flex h-9 w-full items-center gap-3 px-4 text-left">
            <Captions size={20} aria-hidden />
            <span className="flex-1 text-[15px] font-semibold">Templates</span>
            <span className="text-[13px] text-white/50">{look.label}</span>
            <ChevronRight size={18} className="text-white/50" aria-hidden />
          </button>
          <div role="radiogroup" aria-label="Caption templates" className="scrollbar-none mt-3 flex gap-2 overflow-x-auto px-4">
            {CAPTION_LOOKS.slice(0, 6).map((l) => tile(l.id, false))}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl bg-[#2a2a2a]">
          <button
            type="button"
            aria-expanded={advanced}
            onClick={() => setAdvanced((open) => !open)}
            className="flex h-14 w-full items-center px-4 text-left"
          >
            <span className="flex-1 text-[15px] font-semibold text-[#a78bfa]">Advanced options</span>
            {advanced ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
          </button>
          {advanced && (
            <div className="border-t border-white/10">
              <button type="button" onClick={() => setPicker("translate")} className="flex h-14 w-full items-center gap-3 px-4 text-left">
                <Languages size={20} aria-hidden />
                <span className="flex-1 text-[15px] font-semibold">Translated language</span>
                <span className="text-[14px] text-white/50">{TRANSLATIONS.find((t) => t.code === translate)?.name}</span>
                <ChevronRight size={18} className="text-white/50" aria-hidden />
              </button>
              <Toggle icon={Smile} label="AI emojis" checked={emojis} onChange={setEmojis} />
              <Toggle icon={Sparkles} label="Identify filler words" checked={fillers} onChange={setFillers} />
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 p-4 pt-2">
        <button
          type="button"
          onClick={() => void generate()}
          disabled={working !== null}
          className="h-12 w-full rounded-2xl bg-[#5ac8dc] text-[17px] font-semibold text-black disabled:opacity-60"
        >
          Generate
        </button>
      </div>

      {working && (
        <div role="status" className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-t-2xl bg-[#1f1f1f]/95 px-8 text-center">
          <span className="text-[16px] font-semibold">{working}</span>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-[#5ac8dc] transition-[width]" style={{ width: `${Math.max(3, Math.min(100, progress * 100))}%` }} />
          </div>
          <span className="text-[12px] text-white/60">{progressMessage}</span>
        </div>
      )}

      {picker === "source" && (
        <ChoiceSheet
          title="Generate from"
          value={source}
          options={[
            { code: "both", name: SOURCE_NAMES.both, icon: ScanText },
            { code: "video", name: SOURCE_NAMES.video, icon: Play, disabled: !hasVideo },
            { code: "audio", name: SOURCE_NAMES.audio, icon: Mic, disabled: !hasAudio },
          ]}
          onPick={(code) => setSource(code as Source)}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === "language" && (
        <ChoiceSheet title="Spoken language" value={language} options={LANGUAGES} onPick={setLanguage} onClose={() => setPicker(null)} />
      )}
      {picker === "translate" && (
        <ChoiceSheet title="Translated language" value={translate} options={TRANSLATIONS} onPick={setTranslate} onClose={() => setPicker(null)} />
      )}
      {picker === "templates" && (
        <section role="dialog" aria-label="Templates" className="fixed inset-x-0 bottom-0 top-[18%] z-30 flex flex-col rounded-t-2xl bg-[#1f1f1f]">
          <header className="relative flex h-14 shrink-0 items-center justify-center border-b border-white/10">
            <span className="text-[17px] font-semibold">Templates</span>
            <button type="button" aria-label="Close templates" onClick={() => setPicker(null)} className="absolute right-3 grid h-10 w-10 place-items-center">
              <ChevronDown size={24} className="rounded-full border-2 border-white/80 p-0.5" aria-hidden />
            </button>
          </header>
          <div role="radiogroup" aria-label="All caption templates" className="grid min-h-0 flex-1 grid-cols-2 content-start gap-3 overflow-y-auto p-4">
            {CAPTION_LOOKS.map((l) => tile(l.id, true))}
          </div>
        </section>
      )}
    </section>
  );
}
