import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "../stores/settings-store";
import { haptic, hasHaptics } from "./haptics";

describe("haptics", () => {
  const play = vi.fn(async () => undefined);

  beforeEach(() => {
    (window as unknown as { Capacitor: unknown }).Capacitor = { Plugins: { LaamacutHaptics: { play } } };
  });
  afterEach(() => {
    delete (window as unknown as { Capacitor?: unknown }).Capacitor;
    useSettingsStore.setState({ haptics: false });
    play.mockClear();
  });

  it("is off until turned on in Settings", () => {
    expect(useSettingsStore.getState().haptics).toBe(false);
    haptic("click");
    expect(play).not.toHaveBeenCalled();

    useSettingsStore.getState().setHaptics(true);
    haptic("click");
    expect(play).toHaveBeenCalledWith({ kind: "click" });
  });

  it("buzzes once when a drag crosses several snap points at once", () => {
    useSettingsStore.getState().setHaptics(true);
    haptic("tick");
    haptic("tick");
    haptic("tick");
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("does nothing outside the Android app", () => {
    delete (window as unknown as { Capacitor?: unknown }).Capacitor;
    useSettingsStore.getState().setHaptics(true);
    expect(hasHaptics()).toBe(false);
    expect(() => haptic("success")).not.toThrow();
  });
});
