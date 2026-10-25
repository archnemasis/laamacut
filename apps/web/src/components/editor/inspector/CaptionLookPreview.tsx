import React, { useEffect, useState } from "react";
import { CAPTION_LOOKS, type CaptionLook } from "../../../services/caption-looks";
import { ensureFontFamily } from "../../../services/project-fonts";

/** The sample caption every tile plays, a couple of words at a time like real captions. */
const CHUNKS = ["The quick", "brown fox", "jumps over"];
const CHUNK_MS = 1400;

/** One keyframe set per caption animation, played each time a new chunk comes in. */
const KEYFRAMES = `
@keyframes clp-pop { 0% { transform: scale(.4); opacity: 0 } 60% { transform: scale(1.15); opacity: 1 } 100% { transform: scale(1) } }
@keyframes clp-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes clp-slide-up { from { transform: translateY(70%); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes clp-bounce { 0% { transform: translateY(-80%); opacity: 0 } 50% { transform: translateY(12%); opacity: 1 } 75% { transform: translateY(-6%) } 100% { transform: none } }
@keyframes clp-rise { from { transform: translateY(40%) scale(.9); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes clp-blur { from { filter: blur(6px); opacity: 0; transform: scale(1.2) } to { filter: blur(0); opacity: 1; transform: none } }
@keyframes clp-glitch { 0%, 100% { transform: none } 20% { transform: translate(-2px, 1px) skewX(-8deg) } 40% { transform: translate(2px, -1px) } 60% { transform: translate(-1px, 0) skewX(6deg) } 80% { transform: translate(1px, 1px) } }
@keyframes clp-in { from { opacity: 0; transform: scale(.6) } to { opacity: 1; transform: none } }
@keyframes clp-type { from { opacity: 0 } to { opacity: 1 } }
@media (prefers-reduced-motion: reduce) { .clp-word { animation: none !important; opacity: 1 !important } }
`;

const WHOLE: Partial<Record<CaptionLook["animation"], string>> = {
  pop: "clp-pop 380ms ease-out both",
  fade: "clp-fade 420ms ease-out both",
  "slide-up": "clp-slide-up 380ms ease-out both",
  bounce: "clp-bounce 520ms ease-out both",
  rise: "clp-rise 420ms ease-out both",
  blur: "clp-blur 420ms ease-out both",
  glitch: "clp-glitch 300ms steps(2) 2 both",
};

/** How a caption look draws text: its font, colours, outline and shadow, shrunk to tile size. */
export function captionLookStyle(look: CaptionLook): React.CSSProperties {
  const { style } = look;
  const stroke = Math.min(3, (style.strokeWidth ?? 0) / 2.5);
  return {
    fontFamily: style.fontFamily ? `"${style.fontFamily}", sans-serif` : undefined,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    color: style.color,
    backgroundColor: style.backgroundColor,
    padding: style.backgroundColor ? "1px 4px" : undefined,
    borderRadius: style.backgroundColor ? 3 : undefined,
    WebkitTextStroke: stroke > 0 && style.strokeColor ? `${stroke}px ${style.strokeColor}` : undefined,
    paintOrder: "stroke fill",
    textShadow: style.shadowColor
      ? `${Math.min(2, (style.shadowOffsetX ?? 0) / 3)}px ${Math.min(3, (style.shadowOffsetY ?? 0) / 2.5)}px ${Math.min(8, (style.shadowBlur ?? 0) / 3)}px ${style.shadowColor}`
      : undefined,
  };
}

/** Advances every tile's sample caption together, so one timer drives the whole grid. */
export function useCaptionPreviewTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((t) => t + 1), CHUNK_MS);
    return () => window.clearInterval(timer);
  }, []);
  return tick;
}

/**
 * A looping "The quick brown fox" in the look's style, coming in with the
 * look's animation, like CapCut's caption templates.
 */
export function CaptionLookPreview({ look, tick }: { look: CaptionLook; tick: number }) {
  const sample = CHUNKS[tick % CHUNKS.length];
  const chunk = look.uppercase ? sample.toUpperCase() : sample;
  const base = captionLookStyle(look);
  let body: React.ReactNode;
  if (look.animation === "typewriter") {
    body = [...chunk].map((ch, i) => (
      <span key={i} className="clp-word" style={{ animation: `clp-type 1ms ${i * 60}ms both` }}>
        {ch}
      </span>
    ));
  } else if (look.animation === "word-by-word") {
    body = chunk.split(" ").map((word, i) => (
      <span key={i} className="clp-word inline-block" style={{ animation: `clp-in 260ms ease-out ${i * 280}ms both`, marginRight: "0.25em" }}>
        {word}
      </span>
    ));
  } else {
    body = chunk;
  }
  return (
    <span
        key={tick}
        className="clp-word inline-block whitespace-nowrap leading-none"
        style={{ ...base, animation: WHOLE[look.animation] }}
      >
      {body}
    </span>
  );
}

/** The animations and fonts the previews use; render once above the tiles. */
export function CaptionPreviewKeyframes() {
  useEffect(() => {
    for (const look of CAPTION_LOOKS) {
      if (look.style.fontFamily) void ensureFontFamily(look.style.fontFamily, look.style.fontWeight ?? 400, "The quick brown fox jumps over").catch(() => undefined);
    }
  }, []);
  return <style>{KEYFRAMES}</style>;
}
