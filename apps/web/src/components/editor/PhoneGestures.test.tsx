import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const keyframes = vi.hoisted(() => ({
  applyTransform: vi.fn(),
  currentTransform: vi.fn(() => ({ "position.x": 0, "position.y": 0, "scale.x": 1, "scale.y": 1, rotation: 0, opacity: 1 })),
  findSelectedVisual: vi.fn(() => ({ id: "clip-1", kind: "media", startTime: 0, duration: 5, keyframes: [], transform: {} })),
}));
vi.mock("./phone-keyframes", () => keyframes);

import { PhoneGestures } from "./PhoneGestures";

type Applied = { rotation: number; "scale.x": number };
const lastApplied = () => keyframes.applyTransform.mock.calls.at(-1)?.[2] as Applied;

/** Two fingers 200px apart, centred on (300, 300), turned by `deg` and spread by `zoom`. */
function fingers(deg: number, zoom = 1) {
  const r = (100 * zoom);
  const rad = (deg * Math.PI) / 180;
  return [
    { clientX: 300 - r * Math.cos(rad), clientY: 300 - r * Math.sin(rad) },
    { clientX: 300 + r * Math.cos(rad), clientY: 300 + r * Math.sin(rad) },
  ];
}

function pinch(target: HTMLElement, deg: number, zoom = 1) {
  const [a, b] = fingers(0);
  fireEvent.pointerDown(target, { pointerId: 1, ...a });
  fireEvent.pointerDown(target, { pointerId: 2, ...b });
  const [c, d] = fingers(deg, zoom);
  fireEvent.pointerMove(target, { pointerId: 1, ...c });
  fireEvent.pointerMove(target, { pointerId: 2, ...d });
  fireEvent.pointerUp(target, { pointerId: 1, ...c });
  fireEvent.pointerUp(target, { pointerId: 2, ...d });
}

describe("PhoneGestures", () => {
  beforeEach(() => {
    // jsdom has no PointerEvent, which drops pointerId and the coordinates.
    class TestPointerEvent extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
      }
    }
    vi.stubGlobal("PointerEvent", TestPointerEvent);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 600, height: 600, right: 600, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    keyframes.applyTransform.mockClear();
  });

  const mount = () => {
    render(
      <div>
        <div data-preview-screen />
        <PhoneGestures selectedId="clip-1" onTapText={() => undefined} />
      </div>,
    );
    return screen.getByTestId("phone-gestures");
  };

  it("zooms without rotating when the fingers barely twist", () => {
    pinch(mount(), 8, 1.5);
    expect(lastApplied().rotation).toBe(0);
    expect(lastApplied()["scale.x"]).toBeCloseTo(1.5);
  });

  it("starts rotating past the dead zone without jumping", () => {
    pinch(mount(), 40);
    expect(lastApplied().rotation).toBeCloseTo(40 - 12);
  });

  it("snaps onto a right angle", () => {
    pinch(mount(), 12 + 87);
    expect(lastApplied().rotation).toBe(90);
  });
});
