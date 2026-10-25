import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Play, X } from "@/icons/lucide-compat";

interface ExportSavedDialogProps {
  /** The saved file's name. */
  fileName: string;
  /** The project's cover, shown until (or instead of) the video. */
  still?: string;
  /** The finished video, when it was small enough to read back for the player. */
  videoUrl?: string;
  aspect: number;
  /** Opens the folder with the file selected; absent when there's no file path. */
  onReveal?: () => void;
  onClose: () => void;
}

/** Desktop's "Saved" window after an export: a small player and where the file went. */
export function ExportSavedDialog({ fileName, still, videoUrl, aspect, onReveal, onClose }: ExportSavedDialogProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[300] grid place-items-center bg-black/60 p-6" onClick={onClose}>
      <section
        role="dialog"
        aria-label="Video saved"
        className="w-full max-w-[440px] rounded-xl border border-border bg-bg-1 p-5 text-fg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-4 flex items-center">
          <h2 className="text-[15px] font-semibold">Video saved</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="ml-auto grid h-7 w-7 place-items-center rounded-md text-fg-3 hover:bg-hover hover:text-fg">
            <X size={16} aria-hidden />
          </button>
        </header>

        <div className="relative mx-auto max-h-[300px] overflow-hidden rounded-lg bg-black" style={{ aspectRatio: String(aspect), maxWidth: `${300 * aspect}px` }}>
          {videoUrl ? (
            <video
              ref={video}
              src={videoUrl}
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
          {videoUrl && !playing && (
            <button type="button" aria-label="Play video" onClick={() => void video.current?.play()} className="absolute inset-0 grid place-items-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-black/55 text-white">
                <Play size={22} fill="currentColor" className="ml-0.5" aria-hidden />
              </span>
            </button>
          )}
        </div>

        <p className="mt-3 truncate text-center text-[13px] text-fg-2" title={fileName}>
          {fileName}
        </p>

        <footer className="mt-5 flex justify-end gap-2">
          {onReveal && (
            <button type="button" onClick={onReveal} className="rounded-lg bg-bg-3 px-4 py-2 text-[13px] font-semibold text-fg hover:bg-hover">
              Show in folder
            </button>
          )}
          <button type="button" onClick={onClose} className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white">
            Done
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
