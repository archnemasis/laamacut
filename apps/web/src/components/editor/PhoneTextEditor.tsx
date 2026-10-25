import { useEffect, useRef, useState } from "react";
import { Ban, Check, Search, X } from "@/icons/lucide-compat";
import type { TextAnimationPreset, TextStyle } from "@openreel/core";
import { useProjectStore } from "../../stores/project-store";
import { ensureFontFamily } from "../../services/project-fonts";
import { FONT_CATEGORIES } from "./inspector/font-options";
import { TEXT_STYLE_PRESETS } from "./AssetsPanel";

type Tab = "templates" | "fonts" | "styles" | "animations";
type StylePart = "text" | "stroke" | "background" | "shadow";
type AnimationPart = "in" | "out";

const TABS: { id: Tab; label: string }[] = [
  { id: "templates", label: "Templates" },
  { id: "fonts", label: "Fonts" },
  { id: "styles", label: "Styles" },
  { id: "animations", label: "Animations" },
];

/** CapCut's font wall: one tile per family, drawn in that family. */
const FONTS: readonly string[] = [
  "Inter",
  ...Object.entries(FONT_CATEGORIES)
    .filter(([category]) => category !== "System")
    .flatMap(([, families]) => families)
    .filter((family) => family !== "Inter"),
];

/** The "Aa" presets across the top of the Styles tab. */
const STYLE_PRESETS: { label: string; style: Partial<TextStyle> }[] = [
  { label: "White", style: { color: "#ffffff", strokeWidth: 0, backgroundColor: undefined, shadowBlur: 0 } },
  { label: "Outline", style: { color: "#ffffff", strokeColor: "#000000", strokeWidth: 6, backgroundColor: undefined } },
  { label: "Black outline", style: { color: "#000000", strokeColor: "#ffffff", strokeWidth: 6, backgroundColor: undefined } },
  { label: "Label", style: { color: "#000000", backgroundColor: "#ffffff", strokeWidth: 0 } },
  { label: "Yellow", style: { color: "#ffd60a", strokeColor: "#000000", strokeWidth: 6, backgroundColor: undefined } },
  { label: "Red", style: { color: "#ffffff", strokeColor: "#e5262a", strokeWidth: 8, backgroundColor: undefined } },
  { label: "Shadow", style: { color: "#ffffff", shadowColor: "rgba(0,0,0,0.85)", shadowBlur: 12, shadowOffsetX: 0, shadowOffsetY: 4, strokeWidth: 0 } },
];

const SWATCHES = ["#ffffff", "#bdbdbd", "#7a7a7a", "#000000", "#ffd60a", "#ff9f0a", "#e5262a", "#ff3b9a", "#a259ff", "#2f80ed", "#00c2c7", "#34c759"];

const ANIMATIONS: { preset: TextAnimationPreset; label: string }[] = [
  { preset: "fade", label: "Fade" },
  { preset: "pop", label: "Pop" },
  { preset: "typewriter", label: "Typewriter" },
  { preset: "slide-up", label: "Rise" },
  { preset: "slide-down", label: "Drop" },
  { preset: "slide-left", label: "Slide left" },
  { preset: "slide-right", label: "Slide right" },
  { preset: "scale", label: "Zoom" },
  { preset: "blur", label: "Blur" },
  { preset: "bounce", label: "Bounce" },
  { preset: "rotate", label: "Spin" },
  { preset: "elastic", label: "Elastic" },
  { preset: "glitch", label: "Glitch" },
  { preset: "word-by-word", label: "Word by word" },
  { preset: "cascade", label: "Cascade" },
  { preset: "zoom-blur", label: "Zoom blur" },
];

function Slider({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  return (
    <label className="flex items-center gap-3 px-4 py-2 text-[13px] text-fg-2">
      <span className="w-20 shrink-0">{label}</span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="phone-slider min-w-0 flex-1"
      />
      <span className="w-9 shrink-0 text-right font-mono text-[12px] text-fg-3">{Math.round(value * 10) / 10}</span>
    </label>
  );
}

type VirtualKeyboard = EventTarget & { overlaysContent: boolean; boundingRect: DOMRect };

/**
 * Height of the on-screen keyboard. The Android app draws edge to edge, so the
 * keyboard covers the page instead of shrinking it; this tells us how much to
 * lift the text box so it stays visible above the keys.
 */
function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const keyboard = (navigator as Navigator & { virtualKeyboard?: VirtualKeyboard }).virtualKeyboard;
    const viewport = window.visualViewport;
    const measure = () => {
      const fromApi = keyboard?.boundingRect.height ?? 0;
      const fromViewport = viewport ? window.innerHeight - viewport.height - viewport.offsetTop : 0;
      const next = Math.max(fromApi, fromViewport);
      setHeight(next > 80 ? next : 0);
    };
    let restoreOverlay: boolean | undefined;
    if (keyboard) {
      restoreOverlay = keyboard.overlaysContent;
      keyboard.overlaysContent = true;
      keyboard.addEventListener("geometrychange", measure);
    }
    viewport?.addEventListener("resize", measure);
    return () => {
      if (keyboard) {
        keyboard.removeEventListener("geometrychange", measure);
        keyboard.overlaysContent = restoreOverlay ?? false;
      }
      viewport?.removeEventListener("resize", measure);
    };
  }, []);
  return height;
}

/**
 * CapCut's text editor: a text box with a tick, then Templates, Fonts,
 * Styles and Animations tabs. Edits apply live to the selected text clip.
 */
export function PhoneTextEditor({ clipId, isNew, onDone }: { clipId: string; isNew: boolean; onDone: () => void }) {
  const clip = useProjectStore((s) => s.project.textClips?.find((c) => c.id === clipId));
  const [tab, setTab] = useState<Tab>("fonts");
  const [stylePart, setStylePart] = useState<StylePart>("text");
  const [animationPart, setAnimationPart] = useState<AnimationPart>("in");
  // A new clip starts with an empty box; "Enter text" shows on the preview until you type.
  const [draft, setDraft] = useState(isNew ? "" : clip?.text ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const [fontQuery, setFontQuery] = useState("");
  const keyboardHeight = useKeyboardHeight();
  // Which box the keyboard is typing into, so that box is the one lifted above it.
  const [typing, setTyping] = useState<"text" | "search" | null>(null);
  const liftText = keyboardHeight > 0 && typing !== "search";
  const liftSearch = keyboardHeight > 0 && typing === "search";

  useEffect(() => {
    if (isNew) inputRef.current?.focus();
  }, [isNew]);

  // Load the fonts shown on the tiles so each name previews in its own face.
  useEffect(() => {
    if (tab !== "fonts") return;
    for (const family of FONTS) void ensureFontFamily(family, 400, family).catch(() => undefined);
  }, [tab]);

  if (!clip) return null;
  const store = useProjectStore.getState;
  const style = clip.style;
  const setStyle = (next: Partial<TextStyle>) => store().updateTextStyle(clipId, next);
  const animation = clip.animation;

  const changeText = (text: string) => {
    setDraft(text);
    store().updateTextContent(clipId, text || "Enter text");
  };

  const finish = () => {
    if (isNew && !draft.trim()) {
      void import("../../utils/timeline-item-actions").then(({ deleteTimelineItem }) => deleteTimelineItem(store(), clipId));
    }
    onDone();
  };

  const setAnimation = (preset: TextAnimationPreset) => {
    const current = animation ?? { preset: "none" as TextAnimationPreset, params: {}, inDuration: 0, outDuration: 0 };
    const inDuration = animationPart === "in" ? (preset === "none" ? 0 : 0.5) : current.preset === "none" ? 0 : current.inDuration;
    const outDuration = animationPart === "out" ? (preset === "none" ? 0 : 0.5) : current.preset === "none" ? 0 : current.outDuration;
    const nextPreset = preset === "none" && (animationPart === "in" ? outDuration : inDuration) > 0 ? current.preset : preset;
    store().updateTextAnimation(clipId, { ...current, preset: inDuration || outDuration ? nextPreset : "none", inDuration, outDuration });
  };
  const activeAnimation = animation && animation.preset !== "none" && (animationPart === "in" ? animation.inDuration : animation.outDuration) > 0
    ? animation.preset
    : "none";
  const animationDuration = animation ? (animationPart === "in" ? animation.inDuration : animation.outDuration) : 0;

  const swatchTarget: Record<StylePart, keyof TextStyle> = {
    text: "color",
    stroke: "strokeColor",
    background: "backgroundColor",
    shadow: "shadowColor",
  };
  const pickColor = (hex: string | undefined) => {
    if (stylePart === "text") setStyle({ color: hex ?? "#ffffff" });
    if (stylePart === "stroke") setStyle({ strokeColor: hex, strokeWidth: hex ? style.strokeWidth || 6 : 0 });
    if (stylePart === "background") setStyle({ backgroundColor: hex });
    if (stylePart === "shadow") setStyle({ shadowColor: hex, shadowBlur: hex ? style.shadowBlur || 12 : 0, shadowOffsetY: hex ? 4 : 0 });
  };
  const currentColor = style[swatchTarget[stylePart]] as string | undefined;

  const chip = (active: boolean) =>
    `shrink-0 text-[14px] ${active ? "font-semibold text-fg" : "text-fg-3"}`;

  return (
    <section role="dialog" aria-label="Text" className="phone-text-editor flex h-full flex-col bg-bg-1 text-fg">
      {/* While typing, CapCut shows just the text box, sitting on top of the keyboard. */}
      <div
        className={`flex items-center gap-2 px-3 ${liftText ? "fixed inset-x-0 z-[300] bg-bg-1 py-2" : "pt-3"}`}
        style={liftText ? { bottom: keyboardHeight } : undefined}
      >
        <input
          ref={inputRef}
          onFocus={() => setTyping("text")}
          onBlur={() => setTyping(null)}
          value={draft}
          onChange={(e) => changeText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") finish();
          }}
          placeholder="Enter text"
          aria-label="Text"
          className="h-11 min-w-0 flex-1 rounded-lg bg-bg-3 px-3 text-[15px] text-fg outline-none placeholder:text-fg-3"
        />
        <button type="button" aria-label="Done" onClick={finish} className="grid h-11 w-11 place-items-center text-fg">
          <Check size={26} aria-hidden />
        </button>
      </div>

      <div role="tablist" aria-label="Text options" className="scrollbar-none flex shrink-0 gap-6 overflow-x-auto border-b border-border px-4 pt-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`relative shrink-0 pb-2 text-[14px] ${tab === t.id ? "font-semibold text-fg" : "text-fg-3"}`}
          >
            {t.label}
            {tab === t.id && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded bg-accent" />}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {tab === "templates" && (
          <div className="grid grid-cols-3 gap-2 p-3">
            {TEXT_STYLE_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => setStyle(preset.style)}
                className="h-16 truncate rounded-lg bg-bg-3 px-2 text-[13px] font-semibold"
              >
                {preset.name}
              </button>
            ))}
          </div>
        )}

        {tab === "fonts" && (
          // While searching, the box and results ride on top of the keyboard.
          <div
            className={liftSearch ? "fixed inset-x-0 z-[300] max-h-[45vh] overflow-y-auto bg-bg-1 pb-2" : undefined}
            style={liftSearch ? { bottom: keyboardHeight } : undefined}
          >
          <label className="mx-3 mt-3 flex h-10 items-center gap-2 rounded-lg bg-bg-3 px-3 text-fg-3">
            <Search size={16} aria-hidden />
            <input
              type="search"
              onFocus={() => setTyping("search")}
              onBlur={() => setTyping(null)}
              value={fontQuery}
              onChange={(e) => setFontQuery(e.target.value)}
              placeholder="Search fonts"
              aria-label="Search fonts"
              className="min-w-0 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-3 [&::-webkit-search-cancel-button]:hidden"
            />
            {fontQuery && (
              <button type="button" aria-label="Clear search" onClick={() => setFontQuery("")} className="grid h-6 w-6 place-items-center">
                <X size={14} aria-hidden />
              </button>
            )}
          </label>
          <div className="grid grid-cols-3 gap-2 p-3">
            {FONTS.filter((family) => family.toLowerCase().includes(fontQuery.trim().toLowerCase())).map((family) => {
              const active = style.fontFamily === family;
              return (
                <button
                  key={family}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setStyle({ fontFamily: family })}
                  className={`h-11 truncate rounded-lg bg-bg-3 px-2 text-[15px] ${active ? "ring-2 ring-fg" : ""}`}
                  style={{ fontFamily: `"${family}", sans-serif` }}
                >
                  {family}
                </button>
              );
            })}
          </div>
          {!FONTS.some((family) => family.toLowerCase().includes(fontQuery.trim().toLowerCase())) && (
            <p className="px-4 py-6 text-center text-[13px] text-fg-3">No fonts match "{fontQuery}"</p>
          )}
          </div>
        )}

        {tab === "styles" && (
          <>
            <div className="scrollbar-none flex gap-2 overflow-x-auto px-3 pt-3">
              <button
                type="button"
                aria-label="No style"
                onClick={() => setStyle(STYLE_PRESETS[0].style)}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-bg-3 text-fg-2"
              >
                <Ban size={20} aria-hidden />
              </button>
              {STYLE_PRESETS.slice(1).map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  aria-label={`${preset.label} style`}
                  onClick={() => setStyle(preset.style)}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-bg-3 text-[17px] font-extrabold"
                  style={{
                    color: preset.style.color,
                    backgroundColor: preset.style.backgroundColor,
                    WebkitTextStroke: preset.style.strokeWidth ? `1.5px ${preset.style.strokeColor}` : undefined,
                    textShadow: preset.style.shadowBlur ? "0 2px 6px rgba(0,0,0,0.9)" : undefined,
                  }}
                >
                  Aa
                </button>
              ))}
            </div>
            <div className="scrollbar-none flex gap-5 overflow-x-auto px-4 pt-4">
              {(["text", "stroke", "background", "shadow"] as const).map((part) => (
                <button key={part} type="button" aria-pressed={stylePart === part} onClick={() => setStylePart(part)} className={chip(stylePart === part)}>
                  {part === "text" ? "Text" : part === "stroke" ? "Stroke" : part === "background" ? "Background" : "Shadow"}
                </button>
              ))}
            </div>
            <div className="scrollbar-none flex items-center gap-3 overflow-x-auto px-3 pt-3">
              {stylePart !== "text" && (
                <button
                  type="button"
                  aria-label="No color"
                  onClick={() => pickColor(undefined)}
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-bg-3 text-fg-2 ${!currentColor ? "ring-2 ring-fg" : ""}`}
                >
                  <Ban size={16} aria-hidden />
                </button>
              )}
              {SWATCHES.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  aria-label={`Color ${hex}`}
                  aria-pressed={currentColor?.toLowerCase() === hex}
                  onClick={() => pickColor(hex)}
                  className={`h-8 w-8 shrink-0 rounded-full border border-white/20 ${currentColor?.toLowerCase() === hex ? "ring-2 ring-fg ring-offset-2 ring-offset-bg-1" : ""}`}
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
            <div className="pt-3">
              {stylePart === "text" && <Slider label="Size" value={style.fontSize} min={16} max={240} onChange={(fontSize) => setStyle({ fontSize })} />}
              {stylePart === "stroke" && <Slider label="Width" value={style.strokeWidth ?? 0} min={0} max={20} onChange={(strokeWidth) => setStyle({ strokeWidth, strokeColor: style.strokeColor ?? "#000000" })} />}
              {stylePart === "shadow" && <Slider label="Blur" value={style.shadowBlur ?? 0} min={0} max={40} onChange={(shadowBlur) => setStyle({ shadowBlur, shadowColor: style.shadowColor ?? "rgba(0,0,0,0.85)" })} />}
              {stylePart === "text" && <Slider label="Spacing" value={style.letterSpacing} min={-10} max={30} onChange={(letterSpacing) => setStyle({ letterSpacing })} />}
            </div>
          </>
        )}

        {tab === "animations" && (
          <>
            <div className="mx-3 mt-3 flex w-fit rounded-lg bg-bg-3 p-0.5">
              {(["in", "out"] as const).map((part) => (
                <button
                  key={part}
                  type="button"
                  aria-pressed={animationPart === part}
                  onClick={() => setAnimationPart(part)}
                  className={`rounded-md px-5 py-1.5 text-[13px] ${animationPart === part ? "bg-bg-1 font-semibold text-fg" : "text-fg-3"}`}
                >
                  {part === "in" ? "In" : "Out"}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-2 p-3">
              {[{ preset: "none" as TextAnimationPreset, label: "None" }, ...ANIMATIONS].map((item) => {
                const active = activeAnimation === item.preset;
                return (
                  <button
                    key={item.preset}
                    type="button"
                    aria-pressed={active}
                    aria-label={`${animationPart === "in" ? "In" : "Out"} animation ${item.label}`}
                    onClick={() => setAnimation(item.preset)}
                    className="flex flex-col items-center gap-1"
                  >
                    <span className={`grid h-14 w-full place-items-center rounded-lg bg-bg-3 text-[13px] font-semibold ${active ? "ring-2 ring-fg" : ""}`}>
                      {item.preset === "none" ? <Ban size={20} aria-hidden /> : "ABC123"}
                    </span>
                    <span className="w-full truncate text-center text-[11px] text-fg-3">{item.label}</span>
                  </button>
                );
              })}
            </div>
            {activeAnimation !== "none" && animation && (
              <Slider
                label="Duration"
                value={animationDuration}
                min={0.1}
                max={Math.max(0.2, Math.min(3, clip.duration / 2))}
                step={0.1}
                onChange={(value) =>
                  store().updateTextAnimation(clipId, {
                    ...animation,
                    inDuration: animationPart === "in" ? value : animation.inDuration,
                    outDuration: animationPart === "out" ? value : animation.outDuration,
                  })
                }
              />
            )}
          </>
        )}
      </div>
    </section>
  );
}
