import { useEffect, useRef } from "react";

/**
 * Android's back gesture, as a stack of "close this" handlers. Each open
 * layer (a sheet, a text editor, the export screen...) registers while it is
 * showing; back runs the top one, so it peels the app apart one screen at a
 * time instead of exiting. Higher priority goes first; of equals, the latest.
 */
type Entry = { priority: number; order: number; run: () => void };

const entries = new Set<Entry>();
let counter = 0;

export function registerBackHandler(run: () => void, priority = 10): () => void {
  const entry: Entry = { priority, order: counter++, run };
  entries.add(entry);
  return () => void entries.delete(entry);
}

/** Runs the top handler; false when nothing is open, so the app may exit. */
export function handleBack(): boolean {
  let top: Entry | undefined;
  for (const entry of entries) {
    if (!top || entry.priority > top.priority || (entry.priority === top.priority && entry.order > top.order)) top = entry;
  }
  if (!top) return false;
  top.run();
  return true;
}

/** While `active`, back runs `run`. */
export function useBackHandler(active: boolean, run: () => void, priority = 10): void {
  const latest = useRef(run);
  latest.current = run;
  useEffect(() => {
    if (!active) return;
    return registerBackHandler(() => latest.current(), priority);
  }, [active, priority]);
}

declare global {
  interface Window {
    /** Called by the Android activity when back is pressed. */
    __laamacutBack?: () => boolean;
  }
}

export function installBackBridge(): void {
  window.__laamacutBack = handleBack;
}
