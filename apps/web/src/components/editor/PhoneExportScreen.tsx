import { useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, Plus, Settings2 } from "@/icons/lucide-compat";

export type PhoneExportStatus = "exporting" | "saved" | "error";

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
  still?: string;
  aspect: number;
  error?: string | null;
  /** Back arrow: stops a running export, then returns to the editor. */
  onBack: () => void;
  /** Done: back to the home screen. */
  onDone: () => void;
  onNewProject: () => void;
  onExportOptions: () => void;
}

/**
 * CapCut's full-screen export flow: "Exporting in 1080p…" with the frame and
 * a percentage while it renders, then "Saved to device" with Done.
 */
export function PhoneExportScreen({ status, progress, label, still, aspect, error, onBack, onDone, onNewProject, onExportOptions }: PhoneExportScreenProps) {
  // The runner reports per phase, so progress can dip; the screen only counts up.
  const peak = useRef(0);
  peak.current = Math.max(peak.current, Math.min(100, progress));
  const percent = peak.current;
  const frame = (
    <div className="relative mx-auto w-full overflow-hidden bg-black" style={{ aspectRatio: String(aspect) }}>
      {still && <img src={still} alt="" className="h-full w-full object-contain" />}
    </div>
  );

  // Portalled to <body> so no editor layer can stack on top of it. The class
  // keeps the phone's teal accent outside the editor tree.
  return createPortal(
    <div role="dialog" aria-label={status === "saved" ? "Saved to device" : "Exporting"} className="phone-editor fixed inset-0 z-[400] flex flex-col overflow-hidden bg-black text-fg">
      {status === "saved" && still && (
        <img src={still} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-40 blur-3xl" />
      )}
      <header className="relative flex h-16 shrink-0 items-center px-3">
        <button type="button" aria-label={status === "exporting" ? "Cancel export" : "Back to editor"} onClick={onBack} className="grid h-11 w-11 place-items-center rounded-full">
          <ChevronLeft size={28} aria-hidden />
        </button>
        {status === "saved" && (
          <>
            <span className="absolute inset-x-0 text-center text-[16px] font-semibold text-fg-2 pointer-events-none">Saved to device</span>
            <button type="button" onClick={onDone} className="ml-auto px-3 py-2 text-[17px] font-bold">
              Done
            </button>
          </>
        )}
      </header>

      {status !== "saved" ? (
        <div className="relative flex flex-1 flex-col items-center px-6 pt-10">
          <h1 className="text-center text-[26px] font-bold tracking-tight">
            {status === "error" ? "Export failed" : `Exporting in ${label}...`}
          </h1>
          <p className="mt-2 text-center text-[14px] text-fg-3">
            {status === "error" ? error ?? "Something went wrong." : "Please don't close Laamacut or lock your screen."}
          </p>
          <div className="relative mt-12 w-[80%] border-4 border-[#3a3a3a]">
            {frame}
            {status === "exporting" && (
              <>
                <span className="absolute inset-0 bg-black/65" />
                <span className="absolute -top-1 left-0 h-1 bg-white transition-[width] duration-200" style={{ width: `${percent}%` }} />
                <span className="absolute inset-0 grid place-items-center text-[30px] font-semibold tabular-nums">{percent.toFixed(1)}%</span>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="relative min-h-0 flex-1 overflow-y-auto px-4 pb-8">
          <div className="rounded-2xl bg-white/10 px-6 py-6">
            <div className="mx-auto w-[75%] overflow-hidden rounded-lg">{frame}</div>
            <p className="mt-5 text-center text-[14px] text-fg-2">Your video is in your gallery under Movies/Laamacut.</p>
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
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
