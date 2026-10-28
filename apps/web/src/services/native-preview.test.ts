import { describe, expect, it } from "vitest";
import type { Clip } from "@openreel/core";
import {
  clearAncestorBackgrounds,
  clipPlaysNatively,
  driftCorrection,
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
      { uri: "content://media/m-a", inMs: 2000, outMs: 6000 },
      { uri: "content://media/m-b", inMs: 10000, outMs: 13000 },
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
});

describe("clipPlaysNatively", () => {
  it("accepts plain clips and rejects anything the player can't draw", () => {
    expect(clipPlaysNatively(clip("a", 0, 1))).toBe(true);
    expect(clipPlaysNatively(clip("a", 0, 1, 0, { speed: 2 }))).toBe(false);
    expect(clipPlaysNatively(clip("a", 0, 1, 0, { keyframes: [{} as Clip["keyframes"][0]] }))).toBe(false);
    expect(
      clipPlaysNatively(
        clip("a", 0, 1, 0, { transform: { position: { x: 5, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 }, opacity: 1 } }),
      ),
    ).toBe(false);
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
