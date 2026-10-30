import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: {}, screen: {} }));

import { usableWindowState } from "./window-state";

const monitor = { x: 0, y: 0, width: 1920, height: 1040 };

describe("usableWindowState", () => {
  it("keeps a window that is on a connected display", () => {
    const saved = { bounds: { x: 100, y: 80, width: 1280, height: 800 }, maximized: false };
    expect(usableWindowState(saved, [monitor])).toEqual(saved);
  });

  it("drops a window left on a display that is gone", () => {
    expect(usableWindowState({ bounds: { x: 2200, y: 0, width: 1280, height: 800 }, maximized: false }, [monitor])).toBeNull();
  });

  it("drops broken or tiny saves", () => {
    expect(usableWindowState(null, [monitor])).toBeNull();
    expect(usableWindowState({ bounds: { x: 0, y: 0, width: "big", height: 800 } }, [monitor])).toBeNull();
    expect(usableWindowState({ bounds: { x: 0, y: 0, width: 200, height: 100 } }, [monitor])).toBeNull();
  });
});
