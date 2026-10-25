import React, { useCallback, useMemo, useState } from "react";
import {
  SUBTITLE_STYLE_PRESETS,
  splitCaptionIntoSingleLineCues,
  type TranscriptionSegment,
} from "@openreel/core";
import {
  ToolcraftButton as Button,
  ToolcraftCard as Card,
  ToolcraftSelectControl as Selector,
  ToolcraftText as Text,
} from "@openreel/ui";
import {
  AlertCircle,
  Check,
  Download,
  Languages,
  Loader2,
  Sparkles,
} from "@/icons/lucide-compat";
import { useProjectStore } from "../../../stores/project-store";
import { useUIStore } from "../../../stores/ui-store";
import { WHISPER_MODELS, type WhisperModelKey } from "../../../workers/whisper-models";
import { builtInModel, useCaptionTranscriber } from "./use-caption-transcriber";
import { CAPTION_LOOKS, DEFAULT_CAPTION_LOOK, captionFontSize, captionLookById } from "../../../services/caption-looks";
import { CaptionLookPreview, CaptionPreviewKeyframes, useCaptionPreviewTick } from "./CaptionLookPreview";

const WHISPER_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "es", name: "Spanish" },
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
] as const;

interface AutoCaptionPanelProps {
  clipId?: string;
  maxWordsPerLine?: number;
}

export const AutoCaptionPanel: React.FC<AutoCaptionPanelProps> = ({
  clipId,
  maxWordsPerLine = 5,
}) => {
  const getClip = useProjectStore((state) => state.getClip);
  const getMediaItem = useProjectStore((state) => state.getMediaItem);
  const addSubtitle = useProjectStore((state) => state.addSubtitle);
  const {
    workerState,
    progress,
    progressMessage,
    setProgressMessage,
    selectedModel,
    modelBackends,
    changeModel,
    prepareModel,
    transcribeClip,
  } = useCaptionTranscriber();
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [selectedLook, setSelectedLook] = useState<string>(DEFAULT_CAPTION_LOOK.id);
  const previewTick = useCaptionPreviewTick();
  const [segments, setSegments] = useState<TranscriptionSegment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const selectedItems = useUIStore((state) => state.selectedItems);
  const resolvedClipId =
    clipId ?? selectedItems.find((item) => item.type === "clip")?.id ?? "";
  const clip = getClip(resolvedClipId);
  const mediaItem = clip ? getMediaItem(clip.mediaId) : undefined;
  const canTranscribe = Boolean(
    clip && mediaItem && (mediaItem.type === "video" || mediaItem.type === "audio"),
  );

  const handleModelChange = useCallback(
    (value: string) => {
      changeModel(value);
      setSegments([]);
      setError(null);
    },
    [changeModel],
  );

  const handlePrepareModel = useCallback(async () => {
    setError(null);
    try {
      await prepareModel();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Model download failed.");
    }
  }, [prepareModel]);

  const handleTranscribe = useCallback(async () => {
    if (!clip || !mediaItem) return;
    setError(null);
    setSegments([]);
    setIsTranscribing(true);
    try {
      setSegments(await transcribeClip(clip, mediaItem, { language: selectedLanguage }));
      setProgressMessage("Captions are ready to add");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Local transcription failed.");
    } finally {
      setIsTranscribing(false);
    }
  }, [clip, mediaItem, selectedLanguage, setProgressMessage, transcribeClip]);

  const handleAddToTimeline = useCallback(async () => {
    if (!clip || segments.length === 0) return;
    const style = { ...SUBTITLE_STYLE_PRESETS.default, fontSize: captionFontSize(useProjectStore.getState().project.settings) };
    const look = captionLookById(selectedLook);
    let addedCount = 0;
    for (const segment of segments) {
      const cues = splitCaptionIntoSingleLineCues(
        segment.text,
        segment.startTime,
        segment.endTime,
        maxWordsPerLine,
      );
      for (const cue of cues) {
        await addSubtitle(
          {
            id: `whisper-${crypto.randomUUID()}`,
            text: look.uppercase ? cue.text.toUpperCase() : cue.text,
            startTime: cue.startTime,
            endTime: cue.endTime,
            style,
          },
          {
            captionSource: "whisper",
            captionSourceClipId: clip.id,
            captionMaxWordsPerLine: maxWordsPerLine,
            captionWhisperModel: selectedModel,
          },
          look,
        );
        addedCount += 1;
      }
    }
    setSegments([]);
    setProgressMessage(`${addedCount} single-line caption clips added`);
  }, [addSubtitle, clip, maxWordsPerLine, segments, selectedModel, selectedLook]);

  const modelStatus = useMemo(() => {
    const model = WHISPER_MODELS[selectedModel];
    if (workerState === "ready") {
      const backend = modelBackends[selectedModel];
      return `Downloaded and cached${backend ? ` · ${backend === "webgpu" ? "GPU" : "CPU"}` : ""}`;
    }
    if (workerState === "loading") return progressMessage || "Downloading model…";
    if (builtInModel() && selectedModel === "fast") return `Built into the app · ${model.description}`;
    return `${model.downloadSize} · ${model.description}`;
  }, [modelBackends, progressMessage, selectedModel, workerState]);

  return (
    <div className="w-full min-w-0 space-y-3">
      <Card variant="muted" padding={3} className="space-y-2 border border-primary/30 bg-primary/5">
        <div className="flex items-center justify-between gap-2">
          <Text type="supporting" color="secondary" className="text-[10px]">
            Model quality
          </Text>
          <Selector
            label="Local caption model"
            isLabelHidden
            size="sm"
            width={176}
            value={selectedModel}
            onChange={handleModelChange}
            isDisabled={workerState === "loading" || isTranscribing}
            options={(
              Object.entries(WHISPER_MODELS) as Array<
                [WhisperModelKey, (typeof WHISPER_MODELS)[WhisperModelKey]]
              >
            ).map(([value, model]) => ({
              label: model.label,
              value,
            }))}
          />
        </div>
        <div className="flex items-start gap-2">
          {workerState === "ready" ? (
            <Check size={15} className="mt-0.5 text-primary" aria-hidden />
          ) : (
            <Download size={15} className="mt-0.5 text-primary" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <Text type="supporting" weight="bold" className="block text-[11px] text-fg">
              {WHISPER_MODELS[selectedModel].shortLabel}
            </Text>
            <Text type="supporting" color="secondary" className="block text-[9px]">
              {modelStatus}
            </Text>
          </div>
        </div>
        {workerState === "loading" && (
          <div className="h-1.5 overflow-hidden rounded-full bg-bg-2">
            <div
              className="h-full bg-primary transition-[width]"
              style={{ width: `${Math.max(3, Math.min(100, progress * 100))}%` }}
            />
          </div>
        )}
        {workerState === "idle" && (
          <Button
            label={`Download ${WHISPER_MODELS[selectedModel].shortLabel}`}
            icon={<Download size={13} aria-hidden />}
            variant="secondary"
            size="sm"
            onClick={handlePrepareModel}
            className="w-full justify-center"
          />
        )}
        <Text type="supporting" color="secondary" className="block text-[9px] leading-relaxed">
          Stored in this browser after the first download. Media never leaves your device.
        </Text>
      </Card>

      <Card variant="muted" padding={3} className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Languages size={14} className="text-fg-2" aria-hidden />
            <Text type="supporting" color="secondary" className="text-[10px]">Language</Text>
          </div>
          <Selector
            label="Caption language"
            isLabelHidden
            size="sm"
            width={132}
            value={selectedLanguage}
            onChange={setSelectedLanguage}
            isDisabled={isTranscribing}
            options={WHISPER_LANGUAGES.map((language) => ({
              label: language.name,
              value: language.code,
            }))}
          />
        </div>
        <div className="space-y-1.5">
          <Text type="supporting" color="secondary" className="text-[10px]">Caption style</Text>
          <CaptionPreviewKeyframes />
          <div role="radiogroup" aria-label="Caption style" className="grid grid-cols-3 gap-1.5">
            {CAPTION_LOOKS.map((look) => (
              <button
                key={look.id}
                type="button"
                role="radio"
                aria-checked={selectedLook === look.id}
                aria-label={look.label}
                title={look.label}
                disabled={isTranscribing}
                onClick={() => setSelectedLook(look.id)}
                className={`flex aspect-[4/3] flex-col items-center justify-center gap-1 overflow-hidden rounded-md bg-[#2b2b2b] ${selectedLook === look.id ? "ring-2 ring-primary" : ""}`}
              >
                <span className="grid h-7 w-full place-items-center text-[15px]">
                  <CaptionLookPreview look={look} tick={previewTick} />
                </span>
                <span className="text-[8px] text-white/60">{look.label}</span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {error && (
        <Card variant="muted" padding={2} className="flex items-start gap-2 border border-red-500/30 bg-red-500/10">
          <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-400" aria-hidden />
          <Text type="supporting" className="text-[10px] text-red-400">{error}</Text>
        </Card>
      )}

      {isTranscribing && (
        <Card variant="muted" padding={3} className="flex items-center gap-2">
          <Loader2 size={14} className="animate-spin text-primary" aria-hidden />
          <Text type="supporting" color="secondary" className="text-[10px]">
            {progressMessage}
          </Text>
        </Card>
      )}

      {segments.length > 0 && (
        <div className="space-y-2">
          <div className="max-h-36 space-y-1 overflow-y-auto">
            {segments.map((segment, index) => (
              <Card key={`${segment.startTime}-${index}`} variant="muted" padding={2} className="text-[10px]">
                <span className="font-mono text-fg-muted">{segment.startTime.toFixed(1)}s</span>
                <span className="ml-2 text-fg">{segment.text}</span>
              </Card>
            ))}
          </div>
          <Button
            label={`Add ${segments.length} as Editable Text`}
            variant="primary"
            size="sm"
            onClick={handleAddToTimeline}
            className="w-full justify-center"
          />
        </div>
      )}

      <Button
        label={isTranscribing ? "Listening for words…" : "Transcribe Selected Clip"}
        icon={
          isTranscribing ? (
            <Loader2 size={14} className="animate-spin" aria-hidden />
          ) : (
            <Sparkles size={14} aria-hidden />
          )
        }
        variant="primary"
        size="md"
        onClick={handleTranscribe}
        isDisabled={!canTranscribe || isTranscribing}
        className="w-full justify-center"
      />
      {!canTranscribe && (
        <Text type="supporting" color="secondary" className="block text-center text-[9px]">
          Select a connected video or audio clip first.
        </Text>
      )}
    </div>
  );
};

export default AutoCaptionPanel;
