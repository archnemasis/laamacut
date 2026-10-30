import { DEFAULT_VIDEO_SETTINGS, type VideoExportSettings } from "@openreel/core";

/** Streaming services' common loudness target. */
export const EVEN_LOUDNESS_LUFS = -14;

export const RESOLUTIONS = [
  { value: 480, label: "480p" },
  { value: 720, label: "720p" },
  { value: 1080, label: "1080p" },
  { value: 1440, label: "2K" },
  { value: 2160, label: "4K" },
] as const;
export const FRAME_RATES = [24, 25, 30, 50, 60, 120] as const;
export const BITRATES = [5, 10, 20, 50, 100] as const;

export interface PhoneExportChoice {
  resolution: number;
  frameRate: number;
  /** Mbps, or null for the recommended rate. */
  bitrate: number | null;
  /** Evens the mix out to -14 LUFS. */
  evenLoudness: boolean;
}

const STORAGE_KEY = "laamacut-phone-export";
const DEFAULT_CHOICE: PhoneExportChoice = { resolution: 1080, frameRate: 30, bitrate: null, evenLoudness: false };

export function loadPhoneExportChoice(): PhoneExportChoice {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<PhoneExportChoice> | null;
    return { ...DEFAULT_CHOICE, ...saved };
  } catch {
    return DEFAULT_CHOICE;
  }
}

export function savePhoneExportChoice(choice: PhoneExportChoice): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
  } catch {
    // Settings still apply for this session.
  }
}

/** CapCut's recommended bitrate for a resolution and frame rate, in Mbps. */
export function recommendedBitrate(resolution: number, frameRate: number): number {
  const base = resolution >= 2160 ? 40 : resolution >= 1440 ? 20 : resolution >= 1080 ? 12 : resolution >= 720 ? 6 : 3;
  return Math.round(base * (frameRate > 60 ? 2 : frameRate > 30 ? 1.5 : 1));
}

/** Export settings for the choice, keeping the project's shape with `resolution` as the short side. */
export function phoneExportSettings(choice: PhoneExportChoice, project: { width: number; height: number }): VideoExportSettings {
  const scale = choice.resolution / Math.min(project.width, project.height);
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
  const mbps = choice.bitrate ?? recommendedBitrate(choice.resolution, choice.frameRate);
  return {
    ...DEFAULT_VIDEO_SETTINGS,
    width: even(project.width),
    height: even(project.height),
    frameRate: choice.frameRate,
    bitrate: mbps * 1000,
    bitrateMode: "vbr",
    quality: 90,
    keyframeInterval: choice.frameRate * 2,
    audioSettings: choice.evenLoudness
      ? { ...DEFAULT_VIDEO_SETTINGS.audioSettings, loudnessTarget: EVEN_LOUDNESS_LUFS }
      : DEFAULT_VIDEO_SETTINGS.audioSettings,
  };
}

function StepSlider<T extends number>({
  label,
  hint,
  steps,
  value,
  format,
  onChange,
}: {
  label: string;
  hint: string;
  steps: readonly T[];
  value: number;
  format: (step: T) => string;
  onChange: (step: T) => void;
}) {
  const index = Math.max(0, steps.findIndex((step) => step === value));
  return (
    <div className="px-4 py-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[15px] font-semibold">{label}</span>
        <span className="text-[12px] text-fg-3">{hint}</span>
      </div>
      <input
        type="range"
        aria-label={label}
        aria-valuetext={format(steps[index])}
        min={0}
        max={steps.length - 1}
        step={1}
        value={index}
        onChange={(e) => onChange(steps[Number(e.target.value)])}
        className="phone-slider mt-3 w-full"
      />
      <div className="mt-1 flex justify-between text-[11px] text-fg-3">
        {steps.map((step) => (
          <span key={step}>{format(step)}</span>
        ))}
      </div>
    </div>
  );
}

/** CapCut's export settings, dropping down from the quality chip. */
export function PhoneExportPanel({
  choice,
  duration,
  onChange,
  onExportSound,
}: {
  choice: PhoneExportChoice;
  duration: number;
  onChange: (choice: PhoneExportChoice) => void;
  /** Saves just the sound as a WAV. */
  onExportSound?: () => void;
}) {
  const recommended = recommendedBitrate(choice.resolution, choice.frameRate);
  const mbps = choice.bitrate ?? recommended;
  const sizeMb = Math.max(1, Math.round((mbps * Math.max(duration, 0)) / 8 + (192 / 8000) * duration));
  const update = (next: Partial<PhoneExportChoice>) => onChange({ ...choice, ...next });

  return (
    <div role="dialog" aria-label="Export settings" className="absolute inset-x-0 top-full z-50 border-b border-border bg-bg pb-3 shadow-lg">
      <StepSlider
        label="Resolution"
        hint={choice.resolution >= 1080 ? "High definition" : "Smaller file"}
        steps={RESOLUTIONS.map((r) => r.value)}
        value={choice.resolution}
        format={(value) => RESOLUTIONS.find((r) => r.value === value)?.label ?? `${value}p`}
        onChange={(resolution) => update({ resolution })}
      />
      <StepSlider
        label="Frame rate"
        hint={choice.frameRate > 30 ? "Smoother playback" : "Standard"}
        steps={FRAME_RATES}
        value={choice.frameRate}
        format={String}
        onChange={(frameRate) => update({ frameRate })}
      />
      <StepSlider
        label="Bitrate (Mbps)"
        hint={choice.bitrate === null ? `Recommended (${recommended})` : "Better image quality"}
        steps={BITRATES}
        value={choice.bitrate ?? BITRATES.reduce((best, b) => (Math.abs(b - recommended) < Math.abs(best - recommended) ? b : best))}
        format={String}
        onChange={(bitrate) => update({ bitrate })}
      />
      <button
        type="button"
        role="switch"
        aria-checked={choice.evenLoudness}
        onClick={() => update({ evenLoudness: !choice.evenLoudness })}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span>
          <span className="block text-[15px] font-semibold">Even out loudness</span>
          <span className="block text-[12px] text-fg-3">-14 LUFS like YouTube and Spotify. Exports take longer</span>
        </span>
        <span className={`flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors ${choice.evenLoudness ? "justify-end bg-accent" : "justify-start bg-bg-3"}`}>
          <span className="h-5 w-5 rounded-full bg-white" />
        </span>
      </button>
      <p className="pt-1 text-center text-[12px] text-fg-3">Estimated file size: {sizeMb} MB</p>
      {onExportSound && (
        <button type="button" onClick={onExportSound} className="mx-auto mt-2 block rounded-lg bg-bg-2 px-4 py-2 text-[13px] font-semibold">
          Save sound only
        </button>
      )}
    </div>
  );
}
