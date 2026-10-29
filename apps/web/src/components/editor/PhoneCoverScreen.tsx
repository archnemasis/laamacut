import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ImagePlus, X } from "@/icons/lucide-compat";
import { useTimelineStore } from "../../stores/timeline-store";

type Source = "video" | "device";

const STRIP_FRAMES = 10;

/** The biggest preview canvas: what the editor is showing right now. */
function previewCanvas(): HTMLCanvasElement | undefined {
  const canvases = [...document.querySelectorAll<HTMLCanvasElement>("[data-preview-screen] canvas")];
  return canvases.sort((a, b) => b.width * b.height - a.width * a.height)[0];
}

/**
 * CapCut's cover picker: pick a frame from the video by sliding along a
 * strip of its frames, or pick a picture from the device, then save it as
 * the project's cover.
 */
export function PhoneCoverScreen({
  duration,
  aspect,
  thumbAt,
  onSave,
  onClose,
}: {
  duration: number;
  aspect: number;
  /** A small thumbnail of the video at a time on the timeline. */
  thumbAt: (time: number) => string | undefined;
  /** Saves the picture drawn on this canvas as the cover. */
  onSave: (picture: HTMLCanvasElement) => void;
  onClose: () => void;
}) {
  const [source, setSource] = useState<Source>("video");
  const [time, setTime] = useState(() => useTimelineStore.getState().playheadPosition);
  const [devicePicture, setDevicePicture] = useState<HTMLImageElement | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // Choosing a frame moves the editor's playhead; put it back afterwards.
  const startTime = useRef(useTimelineStore.getState().playheadPosition);

  useEffect(() => {
    const timeline = useTimelineStore.getState();
    timeline.pause();
    const back = startTime.current;
    return () => useTimelineStore.getState().seekTo(back);
  }, []);

  // From video: seek the editor and copy its preview into the big frame as it draws.
  useEffect(() => {
    if (source !== "video") return;
    useTimelineStore.getState().seekTo(time);
    let frame = 0;
    const copy = () => {
      const from = previewCanvas();
      const to = canvas.current;
      if (from && to && from.width > 0) {
        if (to.width !== from.width || to.height !== from.height) {
          to.width = from.width;
          to.height = from.height;
        }
        to.getContext("2d")?.drawImage(from, 0, 0);
      }
      frame = requestAnimationFrame(copy);
    };
    frame = requestAnimationFrame(copy);
    return () => cancelAnimationFrame(frame);
  }, [source, time]);

  // From device: the picture fills the frame, cropped to the project's shape.
  useEffect(() => {
    const to = canvas.current;
    if (source !== "device" || !to) return;
    const width = 1080;
    const height = Math.round(width / aspect);
    to.width = width;
    to.height = height;
    const ctx = to.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    if (!devicePicture) return;
    const scale = Math.max(width / devicePicture.naturalWidth, height / devicePicture.naturalHeight);
    const w = devicePicture.naturalWidth * scale;
    const h = devicePicture.naturalHeight * scale;
    ctx.drawImage(devicePicture, (width - w) / 2, (height - h) / 2, w, h);
  }, [source, devicePicture, aspect]);

  const pickFile = (file: File | undefined) => {
    if (fileInput.current) fileInput.current.value = "";
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setDevicePicture(img);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  };

  const chooseDevice = () => {
    setSource("device");
    if (!devicePicture) fileInput.current?.click();
  };

  const canSave = source === "video" || devicePicture !== null;
  const strip = Array.from({ length: STRIP_FRAMES }, (_, i) => thumbAt(((i + 0.5) / STRIP_FRAMES) * duration));

  return createPortal(
    <div role="dialog" aria-label="Cover" className="phone-editor fixed inset-0 z-[400] flex flex-col bg-bg text-fg animate-in fade-in slide-in-from-bottom-4 duration-200 motion-reduce:animate-none">
      <header className="flex h-14 shrink-0 items-center px-2">
        <button type="button" aria-label="Close" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full">
          <X size={24} aria-hidden />
        </button>
        <h1 className="flex-1 text-center text-[16px] font-semibold text-fg">Cover</h1>
        <button
          type="button"
          aria-label="Save cover"
          disabled={!canSave}
          onClick={() => canvas.current && onSave(canvas.current)}
          className="grid h-11 w-11 place-items-center rounded-full disabled:opacity-40"
        >
          <Check size={24} aria-hidden />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center bg-black px-4">
        <div className="relative max-h-full w-full" style={{ aspectRatio: String(aspect), maxWidth: `calc((100vh - 300px) * ${aspect})` }}>
          <canvas ref={canvas} className="h-full w-full object-contain" />
          {source === "device" && !devicePicture && (
            <button type="button" onClick={() => fileInput.current?.click()} className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80">
              <ImagePlus size={32} aria-hidden />
              <span className="text-[14px]">Choose a picture</span>
            </button>
          )}
        </div>
      </div>

      <div className="shrink-0 px-4 pb-6 pt-4">
        <div className="mx-auto flex w-fit rounded-full bg-bg-3 p-1">
          {(
            [
              { id: "video", label: "From video", onClick: () => setSource("video") },
              { id: "device", label: "From device", onClick: chooseDevice },
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={source === option.id}
              onClick={option.onClick}
              className={`rounded-full px-5 py-2 text-[14px] font-semibold ${source === option.id ? "bg-bg-1 text-fg shadow-sm" : "text-fg-3"}`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {source === "video" ? (
          <div className="relative mt-5 h-14 overflow-hidden rounded-lg">
            <div aria-hidden className="flex h-full">
              {strip.map((url, i) => (
                <span key={i} className="h-full flex-1 bg-bg-3 bg-cover bg-center" style={{ backgroundImage: url ? `url("${url}")` : undefined }} />
              ))}
            </div>
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-1.5 -translate-x-1/2 rounded-full bg-white shadow-[0_0_0_2px_rgba(0,0,0,0.4)]"
              style={{ left: `${duration > 0 ? (time / duration) * 100 : 0}%` }}
            />
            <input
              type="range"
              aria-label="Cover frame"
              min={0}
              max={Math.max(0.01, duration)}
              step={0.01}
              value={time}
              onChange={(e) => setTime(Number(e.target.value))}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>
        ) : (
          <button type="button" onClick={() => fileInput.current?.click()} className="mx-auto mt-5 block rounded-full bg-bg-3 px-5 py-2.5 text-[14px] font-semibold">
            {devicePicture ? "Choose another picture" : "Choose a picture"}
          </button>
        )}
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
      </div>
    </div>,
    document.body,
  );
}
