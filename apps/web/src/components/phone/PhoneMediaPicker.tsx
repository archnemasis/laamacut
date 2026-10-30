import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Loader2, Music, X } from "@/icons/lucide-compat";
import { addMediaFilesToTimeline, usePhoneImportStore } from "../../services/phone-media";
import { GalleryFile } from "../../services/gallery-file";
import {
  applyGalleryVideoExtras,
  galleryItemToFile,
  getGallery,
  rememberGalleryOriginal,
  loadHdPreference,
  saveHdPreference,
  prepareGalleryVideo,
  type GalleryAccess,
  type GalleryItem,
  type GalleryKind,
} from "../../services/phone-gallery";

const PAGE = 60;

/**
 * What the picker is for. "add" builds the main track; the editor's Overlay,
 * Replace and Sounds tools use the others and place the files themselves.
 */
export type PickerPurpose = "add" | "overlay" | "replace" | "sound";

/** Called once each picked file is in the media library, so gallery extras can follow it. */
export type PickedMediaReady = (index: number, mediaId: string) => void;

const TABS: Record<PickerPurpose, GalleryKind[]> = {
  add: ["video", "photo"],
  overlay: ["video", "photo"],
  replace: ["video", "photo"],
  sound: ["audio"],
};

const TITLES: Record<PickerPurpose, string> = { add: "Gallery", overlay: "Overlay", replace: "Replace", sound: "Sounds" };
const TAB_LABELS: Record<GalleryKind, string> = { video: "Videos", photo: "Photos", audio: "Music" };
const ACCEPT: Record<GalleryKind, string> = { video: "video/*", photo: "image/*", audio: "audio/*" };

/** One tile in the grid, from the phone gallery or from the browser file picker. */
type Tile = {
  key: string;
  name: string;
  kind: GalleryKind;
  duration?: number;
  /** Object URL of a browser-picked file (videos draw their own first frame). */
  previewUrl?: string;
  galleryItem?: GalleryItem;
  file?: File;
};

const empty = (): Record<GalleryKind, Tile[]> => ({ video: [], photo: [], audio: [] });
const none = (): Record<GalleryKind, boolean> => ({ video: false, photo: false, audio: false });

const formatDuration = (seconds?: number): string => {
  if (seconds === undefined || !Number.isFinite(seconds)) return "";
  const total = Math.round(seconds);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

/** Gallery thumbnail, fetched from the phone once the tile scrolls into view. */
function GalleryThumb({ uri, cache }: { uri: string; cache: Map<string, string> }) {
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState(() => cache.get(uri));
  useEffect(() => {
    if (src) return;
    const el = ref.current;
    const gallery = getGallery();
    if (!el || !gallery) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      gallery
        .thumbnail({ uri, size: 256 })
        .then(({ data }) => {
          cache.set(uri, data);
          setSrc(data);
        })
        .catch(() => undefined);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [uri, src, cache]);
  return (
    <div ref={ref} className="h-full w-full bg-bg-3">
      {src && <img src={src} alt="" className="h-full w-full object-cover" />}
    </div>
  );
}

/**
 * CapCut-style media picker. In the Android app it shows your gallery (after
 * asking for permission) with Videos and Photos tabs, or your music for
 * Sounds; elsewhere it uses the system file picker. Tap to select in order;
 * Add lays them end to end, or hands them to `onPicked` for the editor's tools.
 */
export function PhoneMediaPicker({
  onClose,
  purpose = "add",
  onPicked,
}: {
  onClose: (adding?: boolean) => void;
  purpose?: PickerPurpose;
  onPicked?: (files: File[], ready: PickedMediaReady) => Promise<void>;
}) {
  const gallery = getGallery();
  const tabs = TABS[purpose];
  const single = purpose === "replace";
  const [tab, setTab] = useState<GalleryKind>(tabs[0]);
  const [access, setAccess] = useState<GalleryAccess | "checking">(gallery ? "checking" : "denied");
  const [galleryTiles, setGalleryTiles] = useState(empty);
  const [exhausted, setExhausted] = useState(none);
  const [fileTiles, setFileTiles] = useState<Tile[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const progress = usePhoneImportStore((s) => s.loading);
  const [hd, setHd] = useState(loadHdPreference);
  const thumbCache = useRef(new Map<string, string>()).current;
  const loading = useRef(none());
  const urls = useRef<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => urls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  // Ask for gallery access as soon as the picker opens, like CapCut.
  useEffect(() => {
    if (!gallery) return;
    let cancelled = false;
    void (async () => {
      let current: GalleryAccess;
      if (purpose === "sound") {
        ({ access: current } = await gallery.audioAccess());
        if (current === "denied") ({ access: current } = await gallery.requestAudioAccess());
      } else {
        ({ access: current } = await gallery.access());
        if (current === "denied") ({ access: current } = await gallery.requestAccess());
      }
      if (!cancelled) setAccess(current);
    })().catch(() => !cancelled && setAccess("denied"));
    return () => {
      cancelled = true;
    };
  }, [gallery, purpose]);

  const loadMore = useCallback(
    async (kind: GalleryKind) => {
      if (!gallery || loading.current[kind] || exhausted[kind]) return;
      loading.current[kind] = true;
      try {
        const offset = galleryTiles[kind].length;
        const { items } = await gallery.list({ kind, offset, limit: PAGE });
        const tiles = items.map((item) => ({
          key: item.uri,
          name: item.name,
          kind,
          duration: item.duration,
          galleryItem: item,
        }));
        setGalleryTiles((prev) => ({ ...prev, [kind]: [...prev[kind], ...tiles] }));
        if (items.length < PAGE) setExhausted((prev) => ({ ...prev, [kind]: true }));
      } finally {
        loading.current[kind] = false;
      }
    },
    [gallery, galleryTiles, exhausted],
  );

  const hasGallery = gallery && access !== "denied" && access !== "checking";
  useEffect(() => {
    if (hasGallery && galleryTiles[tab].length === 0 && !exhausted[tab]) void loadMore(tab);
  }, [hasGallery, tab, galleryTiles, exhausted, loadMore]);

  const tiles = useMemo(
    () => [...(hasGallery ? galleryTiles[tab] : []), ...fileTiles.filter((t) => t.kind === tab)],
    [hasGallery, galleryTiles, fileTiles, tab],
  );
  const tileByKey = useMemo(() => {
    const map = new Map<string, Tile>();
    for (const t of [...galleryTiles.video, ...galleryTiles.photo, ...galleryTiles.audio, ...fileTiles]) map.set(t.key, t);
    return map;
  }, [galleryTiles, fileTiles]);

  const addFiles = (files: FileList | null, kind: GalleryKind) => {
    if (!files?.length) return;
    const next = Array.from(files).map((file) => {
      const url = URL.createObjectURL(file);
      urls.current.push(url);
      return { key: url, name: file.name, kind, previewUrl: url, file };
    });
    setFileTiles((prev) => [...prev, ...next]);
    setOrder((prev) => (single ? [next[0].key] : [...prev, ...next.map((t) => t.key)]));
  };

  const toggle = (key: string) =>
    setOrder((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : single ? [key] : [...prev, key]));

  /** Limited access: Android's own prompt to pick more, then the grid reloads with them. */
  const pickMore = async () => {
    if (!gallery) return;
    const { access: next } = await gallery.requestMore();
    setAccess(next);
    setGalleryTiles(empty());
    setExhausted(none());
  };

  const handleAdd = async () => {
    const picked = order.map((key) => tileByKey.get(key)).filter((t): t is Tile => Boolean(t));
    if (picked.length === 0) return;
    // Straight back to the editor, like CapCut: it shows a black preview and
    // blocks touches until everything below has loaded in.
    const setProgress = (loading: string | null) => usePhoneImportStore.setState({ loading });
    onClose(true);
    try {
      // Like CapCut, gallery videos aren't copied in: the clip reads the video
      // straight from the phone's storage (GalleryFile), so it opens at once
      // whatever its size. They get phone-decoded filmstrip frames so the
      // timeline shows pictures from the start, and with HD off, heavy videos
      // (over 1080p or 60fps) get a small copy made in the background that
      // takes over the preview when it's ready. Export reads the original.
      setProgress(purpose === "sound" ? "Loading sounds" : "Loading videos");
      const plans = await Promise.all(
        picked.map((tile) => (tile.galleryItem && tile.kind === "video" ? prepareGalleryVideo(tile.galleryItem, hd) : undefined)),
      );
      const files: File[] = [];
      for (const [i, tile] of picked.entries()) {
        setProgress(`Loading ${i + 1} of ${picked.length}`);
        if (tile.file) files.push(tile.file);
        else if (tile.galleryItem && plans[i]) files.push(new GalleryFile(tile.galleryItem));
        else if (tile.galleryItem) files.push(await galleryItemToFile(tile.galleryItem));
      }
      const filmstrips = await Promise.all(plans.map((plan) => plan?.filmstrip ?? []));
      setProgress(purpose === "replace" ? "Replacing" : "Adding to timeline");
      const ready: PickedMediaReady = (index, mediaId) => {
        const plan = plans[index];
        if (plan) applyGalleryVideoExtras(mediaId, { filmstrip: filmstrips[index] });
        // Export, and reopening the project, go back to the gallery file.
        const tile = picked[index];
        if (tile.galleryItem) rememberGalleryOriginal(mediaId, tile.galleryItem, false);
        void plan?.previewCopy?.then((previewCopy) => {
          if (previewCopy) applyGalleryVideoExtras(mediaId, { filmstrip: [], previewCopy });
        });
      };
      if (onPicked) await onPicked(files, ready);
      else await addMediaFilesToTimeline(files, ready);
    } finally {
      setProgress(null);
    }
  };

  const noun = TAB_LABELS[tab].toLowerCase();

  return (
    <div role="dialog" aria-label={purpose === "add" ? "Add media" : TITLES[purpose]} className="fixed inset-0 z-[200] flex flex-col bg-bg text-fg animate-in fade-in slide-in-from-bottom-4 duration-200 motion-reduce:animate-none">
      <header className="flex h-14 shrink-0 items-center px-2">
        <button type="button" aria-label="Close" onClick={() => onClose()} className="grid h-11 w-11 place-items-center rounded-full">
          <X size={26} aria-hidden />
        </button>
        <span className="mx-auto pr-11 text-[17px] font-semibold">{hasGallery || purpose !== "add" ? TITLES[purpose] : "Add media"}</span>
      </header>

      <div role="tablist" aria-label="Media type" className={`grid shrink-0 border-b border-border ${tabs.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
        {tabs.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`relative h-12 text-[16px] font-semibold ${tab === value ? "text-accent" : "text-fg-3"}`}
          >
            {TAB_LABELS[value]}
            {tab === value && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" />}
          </button>
        ))}
      </div>

      <input ref={fileInput} type="file" accept={ACCEPT[tab]} multiple={!single} hidden aria-label={`Choose ${noun}`} onChange={(e) => { addFiles(e.target.files, tab); e.target.value = ""; }} />

      <div
        className="min-h-0 flex-1 overflow-y-auto"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (hasGallery && el.scrollTop + el.clientHeight > el.scrollHeight - 600) void loadMore(tab);
        }}
      >
        {access === "checking" && (
          <div className="grid h-40 place-items-center text-fg-3">
            <Loader2 size={24} className="animate-spin" aria-label="Loading gallery" />
          </div>
        )}

        {gallery && access === "denied" && (
          <div className="px-6 py-10 text-center">
            <p className="text-[15px] font-semibold">{purpose === "sound" ? "Allow access to your music and sounds" : "Allow access to your videos and photos"}</p>
            <p className="mt-2 text-[13px] text-fg-3">
              Laamacut shows your {purpose === "sound" ? "music" : "gallery"} here so you can pick {purpose === "sound" ? "sounds" : "clips"}. If you blocked it before, allow it in your phone&apos;s Settings → Apps → Laamacut → Permissions.
            </p>
            <button
              type="button"
              onClick={() =>
                void (purpose === "sound" ? gallery.requestAudioAccess() : gallery.requestAccess()).then(({ access: next }) => setAccess(next))
              }
              className="mt-5 rounded-xl bg-accent px-6 py-2.5 text-[15px] font-semibold text-white"
            >
              Allow access
            </button>
          </div>
        )}

        <div className="grid grid-cols-3 gap-0.5">
          {gallery && access === "limited" && (
            <button
              type="button"
              onClick={() => void pickMore()}
              className="flex aspect-square flex-col items-center justify-center gap-2 bg-bg-2 text-[13px] text-fg-2"
            >
              <ImagePlus size={28} strokeWidth={1.5} aria-hidden />
              Pick more
            </button>
          )}
          {(!gallery || access === "denied") && access !== "checking" && (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-2 bg-bg-2 text-[13px] text-fg-2"
            >
              <ImagePlus size={28} strokeWidth={1.5} aria-hidden />
              Choose {noun}
            </button>
          )}
          {tiles.map((tile) => {
            const position = order.indexOf(tile.key);
            const selected = position >= 0;
            return (
              <button
                key={tile.key}
                type="button"
                role="checkbox"
                aria-checked={selected}
                aria-label={[
                  tile.name || TAB_LABELS[tile.kind],
                  tile.kind !== "photo" && tile.duration ? formatDuration(tile.duration) : null,
                  selected && !single ? `number ${position + 1}` : null,
                ]
                  .filter(Boolean)
                  .join(", ")}
                onClick={() => toggle(tile.key)}
                className="relative aspect-square overflow-hidden bg-black"
              >
                {tile.kind === "audio" ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-bg-2 px-2 text-fg-2">
                    <Music size={26} strokeWidth={1.5} aria-hidden />
                    <span className="line-clamp-2 break-all text-center text-[11px]">{tile.name}</span>
                  </div>
                ) : tile.galleryItem ? (
                  <GalleryThumb uri={tile.key} cache={thumbCache} />
                ) : tile.kind === "video" ? (
                  <video
                    src={`${tile.previewUrl}#t=0.1`}
                    muted
                    playsInline
                    preload="metadata"
                    onLoadedMetadata={(e) => {
                      const duration = e.currentTarget.duration;
                      setFileTiles((prev) => prev.map((t) => (t.key === tile.key ? { ...t, duration } : t)));
                    }}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <img src={tile.previewUrl} alt="" className="h-full w-full object-cover" />
                )}
                {selected && <span className="absolute inset-0 bg-black/30" />}
                <span
                  className={`absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full border-2 text-[12px] font-bold ${
                    selected ? "border-accent bg-accent text-white" : "border-white bg-black/10"
                  }`}
                >
                  {selected && !single ? position + 1 : ""}
                </span>
                {tile.kind !== "photo" && (
                  <span className="absolute bottom-1.5 right-2 text-[13px] font-semibold text-white drop-shadow">
                    {formatDuration(tile.duration)}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {access !== "checking" && tiles.length === 0 && !(gallery && access === "denied") && (
          <p className="px-6 py-8 text-center text-[13px] text-fg-3">
            {hasGallery
              ? `No ${noun} found on this phone.`
              : purpose === "sound"
                ? "Pick sounds or music from your phone."
                : "Pick from your gallery. Clips go on the timeline in the order you select them."}
          </p>
        )}
      </div>

      <footer className="flex h-16 shrink-0 items-center justify-between gap-3 border-t border-border px-4">
        <span className="min-w-0 truncate text-[13px] text-fg-2">{progress ?? (order.length > 0 && !single ? `${order.length} selected` : "")}</span>
        {hasGallery && purpose !== "sound" && (
          <button
            type="button"
            role="switch"
            aria-checked={hd}
            aria-label="HD"
            title={hd ? "Full resolution: best quality, may lag on slower phones" : "Smooth editing: 4K and high frame rate videos preview from a light copy. Turn on HD for full resolution"}
            onClick={() => {
              saveHdPreference(!hd);
              setHd(!hd);
            }}
            className="ml-auto flex shrink-0 items-center gap-2 text-[15px] font-semibold"
          >
            <span className={`grid h-6 w-6 place-items-center rounded-full border-2 ${hd ? "border-accent bg-accent" : "border-fg-3"}`}>
              {hd && <span className="h-2 w-2 rounded-full bg-white" />}
            </span>
            HD
          </button>
        )}
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={order.length === 0 || progress !== null}
          className="flex min-w-[96px] items-center justify-center gap-2 rounded-xl bg-accent px-6 py-2.5 text-[15px] font-semibold text-white disabled:opacity-40"
        >
          {progress !== null && <Loader2 size={16} className="animate-spin" aria-hidden />}
          {single ? "Replace" : "Add"}
        </button>
      </footer>
    </div>
  );
}
