import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, Heart, Play, Plus, Settings2 } from "@/icons/lucide-compat";
import { DONATE_URL, openLink } from "../../services/support-links";

export type PhoneExportStatus = "naming" | "exporting" | "saved" | "error";

/** The preview frame showing right now, as an image for the export screens. */
export function capturePreviewStill(): string | undefined {
  const canvases = [...document.querySelectorAll<HTMLCanvasElement>("[data-preview-screen] canvas")];
  const largest = canvases.sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (!largest || largest.width === 0) return undefined;
  try {
    return largest.toDataURL("image/jpeg", 0.8);
  } catch {
    return undefined;
  }
}

interface PhoneExportScreenProps {
  status: PhoneExportStatus;
  progress: number;
  /** "1080p", "2K"... */
  label: string;
  /** The project's cover. */
  still?: string;
  /** The finished video, for the little player on the Saved screen. */
  videoUrl?: string;
  /** Where the video was saved, like "Movies/Laamacut". */
  location?: string;
  aspect: number;
  error?: string | null;
  /** Suggested name in the naming prompt. */
  name: string;
  /** The naming prompt's Export: starts the export under that name. */
  onName: (name: string) => void;
  /** Back arrow: stops a running export, then returns to the editor. */
  onBack: () => void;
  /** Done: back to the home screen. */
  onDone: () => void;
  onNewProject: () => void;
  onExportOptions: () => void;
}

/** CapCut's progress line: runs once round the frame, clockwise from the top-left corner. */
function ProgressRing({ percent }: { percent: number }) {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
      <rect x="0" y="0" width="100%" height="100%" fill="none" stroke="#3a3a3a" strokeWidth="4" />
      <rect
        data-testid="export-ring"
        x="0"
        y="0"
        width="100%"
        height="100%"
        fill="none"
        stroke="#fff"
        strokeWidth="4"
        pathLength={100}
        strokeDasharray="100 100"
        strokeDashoffset={100 - percent}
        className="transition-[stroke-dashoffset] duration-200"
      />
    </svg>
  );
}

function NamePrompt({ name, onName, onCancel }: { name: string; onName: (name: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(name);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.select(), []);
  const submit = () => onName(value.trim() || name);
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 px-6">
      <form
        role="dialog"
        aria-label="Name your video"
        className="w-full max-w-sm rounded-2xl bg-bg-2 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h2 className="text-[18px] font-semibold">Name your video</h2>
        <input
          ref={input}
          aria-label="Video name"
          value={value}
          maxLength={80}
          onChange={(e) => setValue(e.target.value)}
          className="mt-4 h-11 w-full rounded-lg bg-white/10 px-3 text-[15px] text-fg outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />
        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onCancel} className="h-11 flex-1 rounded-full bg-white/10 text-[15px] font-semibold">
            Cancel
          </button>
          <button type="submit" className="h-11 flex-1 rounded-full bg-[var(--accent)] text-[15px] font-semibold text-black">
            Export
          </button>
        </div>
      </form>
    </div>
  );
}

/** The finished video in a small frame, with one play button. */
function SavedPlayer({ url, still, aspect }: { url?: string; still?: string; aspect: number }) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  return (
    <div className="relative mx-auto w-[75%] overflow-hidden rounded-lg bg-black" style={{ aspectRatio: String(aspect) }}>
      {url ? (
        <video
          ref={video}
          src={url}
          poster={still}
          playsInline
          className="h-full w-full object-contain"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onClick={() => video.current?.pause()}
        />
      ) : (
        still && <img src={still} alt="" className="h-full w-full object-contain" />
      )}
      {url && !playing && (
        <button
          type="button"
          aria-label="Play video"
          onClick={() => void video.current?.play()}
          className="absolute inset-0 grid place-items-center"
        >
          <span className="grid h-14 w-14 place-items-center rounded-full bg-black/55">
            <Play size={26} fill="currentColor" className="ml-1" aria-hidden />
          </span>
        </button>
      )}
    </div>
  );
}

/**
 * CapCut's full-screen export flow: name the video, "Exporting in 1080p…" with
 * the cover fading in as a line runs round it, then "Saved to device" with Done.
 */
export function PhoneExportScreen({ status, progress, label, still, videoUrl, location, aspect, error, name, onName, onBack, onDone, onNewProject, onExportOptions }: PhoneExportScreenProps) {
  // The runner reports per phase, so progress can dip; the screen only counts up.
  // Each new export starts the count again from 0.
  const peak = useRef(0);
  const lastStatus = useRef(status);
  if (status === "exporting" && lastStatus.current !== "exporting") peak.current = 0;
  lastStatus.current = status;
  if (status === "naming") peak.current = 0;
  else peak.current = Math.max(peak.current, Math.min(100, progress));
  const percent = peak.current;

  // Portalled to <body> so no editor layer can stack on top of it. The class
  // keeps the phone's teal accent outside the editor tree.
  return createPortal(
    <div role="dialog" aria-label={status === "saved" ? "Saved to device" : status === "naming" ? "Export" : "Exporting"} className="phone-editor dark fixed inset-0 z-[400] flex flex-col overflow-hidden bg-black text-fg">
      {status === "saved" && still && (
        <img src={still} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-40 blur-3xl" />
      )}
      <header className="relative flex h-16 shrink-0 items-center px-3">
        <button type="button" aria-label={status === "exporting" ? "Cancel export" : "Back to editor"} onClick={onBack} className="grid h-11 w-11 place-items-center rounded-full">
          <ChevronLeft size={28} aria-hidden />
        </button>
        {status === "saved" && (
          <>
            <span className="pointer-events-none absolute inset-x-0 text-center text-[16px] font-semibold text-fg-2">Saved to device</span>
            <button type="button" onClick={onDone} className="ml-auto px-3 py-2 text-[17px] font-bold">
              Done
            </button>
          </>
        )}
      </header>

      {status !== "saved" ? (
        <div className="relative flex flex-1 flex-col items-center px-6 pt-10">
          <h1 className="text-center text-[26px] font-bold tracking-tight">
            {status === "error" ? "Export failed" : status === "naming" ? `Ready to export in ${label}` : `Exporting in ${label}...`}
          </h1>
          <p className="mt-2 text-center text-[14px] text-fg-3">
            {status === "error"
              ? error ?? "Something went wrong."
              : status === "naming"
                ? "Name your video to start."
                : "Please don't close Laamacut or lock your screen."}
          </p>
          <div className="relative mt-12 w-[80%] bg-black" style={{ aspectRatio: String(aspect) }}>
            {still && (
              <img
                src={still}
                alt=""
                className="h-full w-full object-cover transition-opacity duration-300"
                style={{ opacity: 0.12 + 0.88 * (percent / 100) }}
              />
            )}
            {status !== "naming" && <ProgressRing percent={percent} />}
            {status === "exporting" && (
              <span className="absolute inset-0 grid place-items-center text-[30px] font-semibold tabular-nums [text-shadow:0_1px_8px_rgba(0,0,0,0.8)]">
                {percent.toFixed(1)}%
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="relative min-h-0 flex-1 overflow-y-auto px-4 pb-8">
          <div className="rounded-2xl bg-white/10 px-6 py-6">
            <SavedPlayer url={videoUrl} still={still} aspect={aspect} />
            <p className="mt-5 text-center text-[14px] text-fg-2">
              {location ? `Your video is in your gallery under ${location}.` : "Your video has been downloaded."}
            </p>
          </div>
          <h2 className="mt-7 text-[19px] font-semibold">Quick actions</h2>
          <div className="mt-3 grid grid-cols-4 gap-3">
            <button type="button" onClick={onNewProject} className="flex flex-col items-center gap-2 text-[13px] text-fg-2">
              <span className="grid h-16 w-full place-items-center rounded-xl bg-white/10">
                <Plus size={26} aria-hidden />
              </span>
              New project
            </button>
            <button type="button" onClick={onExportOptions} className="flex flex-col items-center gap-2 text-center text-[13px] text-fg-2">
              <span className="grid h-16 w-full place-items-center rounded-xl bg-white/10">
                <Settings2 size={24} aria-hidden />
              </span>
              Export options
            </button>
            {DONATE_URL && (
              <button type="button" onClick={() => openLink(DONATE_URL)} className="flex flex-col items-center gap-2 text-center text-[13px] text-fg-2">
                <span className="grid h-16 w-full place-items-center rounded-xl bg-white/10">
                  <Heart size={24} aria-hidden />
                </span>
                Support us
              </button>
            )}
          </div>
          <p className="mt-6 text-center text-[12px] text-fg-3">
            {DONATE_URL ? "No watermark, no ads. If Laamacut saved you time, a small tip keeps it free." : "No watermark, no ads."}
          </p>
        </div>
      )}

      {status === "naming" && <NamePrompt name={name} onName={onName} onCancel={onBack} />}
    </div>,
    document.body,
  );
}
