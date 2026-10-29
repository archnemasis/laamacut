import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TitleEngine } from "./title-engine";

describe("TitleEngine render cache", () => {
  const fillText = vi.fn();

  beforeEach(() => {
    const ctx = {
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      measureText: vi.fn(() => ({ width: 200 })),
      fillRect: vi.fn(),
      strokeText: vi.fn(),
      fillText,
      font: "",
      fillStyle: "",
      textAlign: "center",
      textBaseline: "middle",
      globalAlpha: 1,
      shadowColor: "transparent",
    };
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        constructor(
          readonly width: number,
          readonly height: number,
        ) {}
        getContext() {
          return ctx;
        }
      },
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fillText.mockClear();
  });

  const caption = (engine: TitleEngine, text: string) =>
    engine.createTextClip({ id: "caption", trackId: "text-track", startTime: 0, duration: 3, text });

  it("reuses the picture while the text looks the same", () => {
    const engine = new TitleEngine();
    const clip = caption(engine, "Hello there");
    const first = engine.renderText(clip, 1080, 1920, 0.5);
    const second = engine.renderText(clip, 1080, 1920, 1.5);
    expect(second.canvas).toBe(first.canvas);
    expect(fillText).toHaveBeenCalledTimes(1);
  });

  it("draws again when the text, size or style changes", () => {
    const engine = new TitleEngine();
    const first = engine.renderText(caption(engine, "Hello there"), 1080, 1920, 0.5);
    const edited = engine.renderText(caption(engine, "Hello again"), 1080, 1920, 0.5);
    expect(edited.canvas).not.toBe(first.canvas);
    const resized = engine.renderText(caption(engine, "Hello again"), 540, 960, 0.5);
    expect(resized.canvas).not.toBe(edited.canvas);
    const recoloured = engine.renderText(
      { ...caption(engine, "Hello again"), style: { ...caption(engine, "x").style, color: "#ff0000" } },
      540,
      960,
      0.5,
    );
    expect(recoloured.canvas).not.toBe(resized.canvas);
  });
});
