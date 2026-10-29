import { useSettingsStore } from "../stores/settings-store";

/**
 * tick: snapping into place. click: a tool did something. heavy: a clip was
 * picked up. success / error: an export finished or failed.
 */
export type HapticKind = "tick" | "click" | "heavy" | "success" | "error";

interface HapticsPlugin {
  play(options: { kind: HapticKind }): Promise<void>;
}

function plugin(): HapticsPlugin | undefined {
  if (typeof window === "undefined") return undefined;
  return (window.Capacitor?.Plugins as { LaamacutHaptics?: HapticsPlugin } | undefined)?.LaamacutHaptics;
}

/** Whether this device can give touch feedback (the Android app). */
export function hasHaptics(): boolean {
  return !!plugin();
}

let lastTick = 0;

/** Plays a touch feedback pattern, if the phone supports it and Haptics is on in Settings. */
export function haptic(kind: HapticKind): void {
  const native = plugin();
  if (!native || !useSettingsStore.getState().haptics) return;
  if (kind === "tick") {
    // A drag can cross several snap points at once; one buzz is enough.
    const now = performance.now();
    if (now - lastTick < 40) return;
    lastTick = now;
  }
  void native.play({ kind }).catch(() => undefined);
}
