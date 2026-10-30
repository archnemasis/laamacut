import { describe, expect, it } from "vitest";
import type { Clip } from "@openreel/core";
import {
  clearAncestorBackgrounds,
  clipPlaysNatively,
  driftCorrection,
  nativeFrameOf,
  nativeTimelineTime,
  planNativePreview,
  planSeekTarget,
} from "./native-preview";

const clip = (id: string, startTime: number, duration: number, inPoint = 0, extra: Partial<Clip> = {}): Clip =>
  ({
    id,
    mediaId: `m-${id}`,
    trackId: "t",
    startTime,
    duration,
    inPoint,
    outPoint: inPoint + duration,
    effects: [],
    audioEffects: [],
    transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 }, opacity: 1 },
    volume: 1,
    keyframes: [],
    ...extra,
  }) as Clip;

const uri = (mediaId: string) => `content://media/${mediaId}`;

describe("planNativePreview", () => {
  it("plays back-to-back clips from the playhead", () => {
    const plan = planNativePreview([clip("b", 4, 3, 10), clip("a", 0, 4, 2)], 1.5, uri)!;
    expect(plan.clips).toEqual([
      { uri: "content://media/m-a", inMs: 2000, outMs: 6000, speed: 1 },
      { uri: "content://media/m-b", inMs: 10000, outMs: 13000, speed: 1 },
    ]);
    expect(plan.positionMs).toBe(1500);
    expect(plan.end).toBe(7);
  });

  it("stops the run at a gap or a clip that isn't from the gallery", () => {
    expect(planNativePreview([clip("a", 0, 2), clip("b", 3, 2)], 0, uri)!.end).toBe(2);
    const noUri = (id: string) => (id === "m-b" ? undefined : uri(id));
    expect(planNativePreview([clip("a", 0, 2), clip("b", 2, 2)], 0, noUri)!.clips).toHaveLength(1);
    expect(planNativePreview([clip("a", 0, 2)], 0, () => undefined)).toBeNull();
  });

  it("is null when the playhead is in a gap", () => {
    expect(planNativePreview([clip("a", 1, 2)], 0.5, uri)).toBeNull();
  });

  it("maps between player and timeline time", () => {
    const plan = planNativePreview([clip("a", 0, 4), clip("b", 4, 3)], 0, uri)!;
    expect(nativeTimelineTime(plan, 1, 500)).toBe(4.5);
    expect(nativeTimelineTime(plan, undefined, 0)).toBeNull();
    expect(planSeekTarget(plan, 5.25)).toEqual({ index: 1, positionMs: 1250 });
  });

  it("maps a sped-up clip's source time to timeline time", () => {
    // 2x: 2 timeline seconds cover 4 source seconds.
    const plan = planNativePreview([clip("a", 0, 2, 1, { speed: 2 }), clip("b", 2, 1)], 0.5, uri)!;
    expect(plan.clips[0]).toMatchObject({ inMs: 1000, outMs: 5000, speed: 2 });
    expect(plan.positionMs).toBe(1000);
    expect(nativeTimelineTime(plan, 0, 3000)).toBe(1.5);
    expect(planSeekTarget(plan, 1.5)).toEqual({ index: 0, positionMs: 3000 });
  });

  it("is null when clips overlap", () => {
    expect(planNativePreview([clip("a", 0, 2), clip("b", 1, 2)], 0, uri)).toBeNull();
  });
});

describe("nativeFrameOf", () => {
  const canvas = { width: 1080, height: 1920 };
  it("leaves plain fitted clips to the player", () => {
    expect(nativeFrameOf(clip("a", 0, 1).transform, { width: 1080, height: 608 }, canvas)).toBeUndefined();
  });

  it("describes a moved, scaled clip as fractions of the canvas", () => {
    const transform = { position: { x: 108, y: -192 }, scale: { x: 1.5, y: 1.5 }, rotation: 10, anchor: { x: 0.5, y: 0.5 }, opacity: 1 };
    expect(nativeFrameOf(transform, { width: 1080, height: 960 }, canvas)).toEqual({
      width: 1, height: 0.5, x: 0.1, y: -0.1, anchorX: 0.5, anchorY: 0.5, rotation: 10, scaleX: 1.5, scaleY: 1.5, opacity: 1,
    });
  });

  it("passes a crop on, so even an otherwise plain clip is placed by the app", () => {
    const crop = { x: 0.25, y: 0, width: 0.5, height: 1 };
    const transform = { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 }, opacity: 1, crop };
    expect(nativeFrameOf(transform, { width: 1080, height: 1215 }, canvas)).toMatchObject({ crop, width: 1 });
    expect(clipPlaysNatively(clip("a", 0, 1, 0, { transform }))).toBe(true);
  });
});

describe("clipPlaysNatively", () => {
  it("accepts plain clips and rejects anything the player can't draw", () => {
    expect(clipPlaysNatively(clip("a", 0, 1))).toBe(true);
    expect(clipPlaysNatively(clip("a", 0, 1, 0, { speed: 2 }))).toBe(true);
    expect(clipPlaysNatively(clip("a", 0, 1, 0, { reversed: true }))).toBe(false);
    expect(clipPlaysNatively(clip("a", 0, 1, 0, { keyframes: [{} as Clip["keyframes"][0]] }))).toBe(false);
    expect(
      clipPlaysNatively(
        clip("a", 0, 1, 0, { transform: { position: { x: 5, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 }, opacity: 1 } }),
      ),
    ).toBe(true);
    expect(
      clipPlaysNatively(
        clip("a", 0, 1, 0, { transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 }, opacity: 0.5 } }),
      ),
    ).toBe(true);
    expect(clipPlaysNatively(clip("a", 0, 1, 0, { transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 }, opacity: 1, borderRadius: 12 } }))).toBe(false);
    expect(clipPlaysNatively(clip("a", 0, 1, 0, { colorGrading: {} }))).toBe(true);
  });
});

describe("driftCorrection", () => {
  it("seeks on big drift and nudges speed on small drift", () => {
    expect(driftCorrection(0.5)).toEqual({ seek: true });
    expect(driftCorrection(0.01)).toEqual({ speed: 1 });
    expect(driftCorrection(0.1)).toEqual({ speed: 0.95 });
    expect(driftCorrection(-0.03)).toEqual({ speed: 1.03 });
  });
});

describe("clearAncestorBackgrounds", () => {
  it("clears and restores backgrounds up the tree", () => {
    const outer = document.createElement("div");
    outer.style.backgroundColor = "red";
    const inner = document.createElement("div");
    outer.appendChild(inner);
    document.body.appendChild(outer);
    const restore = clearAncestorBackgrounds(inner);
    expect(outer.style.backgroundColor).toBe("transparent");
    restore();
    expect(outer.style.backgroundColor).toBe("red");
    expect(inner.style.backgroundColor).toBe("");
    outer.remove();
  });
});
