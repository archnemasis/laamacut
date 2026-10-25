import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "@/icons/lucide-compat";
import { addMediaFilesToTimeline } from "../../services/phone-media";

type PickerTab = "video" | "photo";

type Picked = { file: File; url: string; kind: PickerTab; duration?: number };

const formatDuration = (seconds?: number): string => {
  if (seconds === undefined || !Number.isFinite(seconds)) return "";
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/**
 * CapCut-style media picker: Videos and Photos tabs, numbered selection in
 * the order you tap, and Add, which lays everything end to end on the
 * timeline. Files come from the phone's own gallery picker.
 */
export function PhoneMediaPicker({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<PickerTab>("video");
  const [items, setItems] = useState<Picked[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const videoInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const keyOf = (item: Picked) => item.url;
  const shown = useMemo(() => items.filter((item) => item.kind === tab), [items, tab]);

  const addFiles = (files: FileList | null, kind: PickerTab) => {
    if (!files?.length) return;
    const next = Array.from(files).map((file) => ({ file, url: URL.createObjectURL(file), kind }));
    urls.current.push(...next.map((item) => item.url));
    setItems((prev) => [...prev, ...next]);
    // Newly chosen files start selected, in the order the gallery returned them.
    setOrder((prev) => [...prev, ...next.map(keyOf)]);
  };

  const toggle = (item: Picked) => {
    const key = keyOf(item);
    setOrder((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const setDuration = (url: string, duration: number) =>
    setItems((prev) => prev.map((item) => (item.url === url ? { ...item, duration } : item)));

  const handleAdd = async () => {
    const byKey = new Map(items.map((item) => [keyOf(item), item.file] as const));
    const files = order.map((key) => byKey.get(key)).filter((file): file is File => Boolean(file));
    if (files.length === 0) return;
    setAdding(true);
    try {
      await addMediaFilesToTimeline(files);
    } finally {
      setAdding(false);
      onClose();
    }
  };

  const openGallery = () => (tab === "video" ? videoInput : photoInput).current?.click();

  return (
    <div role="dialog" aria-label="Add media" className="fixed inset-0 z-[200] flex flex-col bg-bg text-fg">
      <header className="flex h-14 shrink-0 items-center px-2">
        <button type="button" aria-label="Close" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full">
          <X size={24} aria-hidden />
        </button>
        <div role="tablist" aria-label="Media type" className="mx-auto flex gap-6 pr-11">
          {(["video", "photo"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`relative py-2 text-[16px] font-semibold ${tab === value ? "text-fg" : "text-fg-3"}`}
            >
              {value === "video" ? "Videos" : "Photos"}
              {tab === value && <span className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded bg-fg" />}
            </button>
          ))}
        </div>
      </header>

      <input ref={videoInput} type="file" accept="video/*" multiple hidden aria-label="Choose videos" onChange={(e) => { addFiles(e.target.files, "video"); e.target.value = ""; }} />
      <input ref={photoInput} type="file" accept="image/*" multiple hidden aria-label="Choose photos" onChange={(e) => { addFiles(e.target.files, "photo"); e.target.value = ""; }} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-3 gap-0.5">
          <button
            type="button"
            onClick={openGallery}
            className="flex aspect-square flex-col items-center justify-center gap-2 bg-bg-2 text-[13px] text-fg-2"
          >
            <ImagePlus size={28} strokeWidth={1.5} aria-hidden />
            {tab === "video" ? "Choose videos" : "Choose photos"}
          </button>
          {shown.map((item) => {
            const position = order.indexOf(keyOf(item));
            const selected = position >= 0;
            return (
              <button
                key={item.url}
                type="button"
                aria-label={`${selected ? "Deselect" : "Select"} ${item.file.name}`}
                aria-pressed={selected}
                onClick={() => toggle(item)}
                className="relative aspect-square overflow-hidden bg-black"
              >
                {item.kind === "video" ? (
                  <video
                    src={`${item.url}#t=0.1`}
                    muted
                    playsInline
                    preload="metadata"
                    onLoadedMetadata={(e) => setDuration(item.url, e.currentTarget.duration)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <img src={item.url} alt="" className="h-full w-full object-cover" />
                )}
                <span
                  className={`absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full border-2 text-[12px] font-bold ${
                    selected ? "border-accent bg-accent text-white" : "border-white/90 bg-black/20"
                  }`}
                >
                  {selected ? position + 1 : ""}
                </span>
                {item.kind === "video" && (
                  <span className="absolute bottom-1 right-1.5 text-[11px] font-medium text-white drop-shadow">
                    {formatDuration(item.duration)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {shown.length === 0 && (
          <p className="px-6 py-8 text-center text-[13px] text-fg-3">
            {tab === "video" ? "Pick videos from your gallery." : "Pick photos from your gallery."} They go on the timeline in the order you select them.
          </p>
        )}
      </div>

      <footer className="flex h-16 shrink-0 items-center justify-between gap-3 border-t border-border px-4">
        <span className="text-[13px] text-fg-2">{order.length > 0 ? `${order.length} selected` : "Nothing selected"}</span>
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={order.length === 0 || adding}
          className="flex min-w-[96px] items-center justify-center gap-2 rounded-xl bg-accent px-6 py-2.5 text-[15px] font-semibold text-white disabled:opacity-40"
        >
          {adding && <Loader2 size={16} className="animate-spin" aria-hidden />}
          Add
        </button>
      </footer>
    </div>
  );
}
