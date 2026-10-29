let preloadPromise: Promise<unknown> | null = null;

/**
 * Starts downloading the editor when someone shows intent to open it (hovering
 * or focusing Create/Open), so the welcome screen itself stays light.
 */
export function preloadEditor(): void {
  if (preloadPromise) return;
  preloadPromise = import("../components/editor/EditorInterface").catch((error) => {
    preloadPromise = null;
    console.warn("[Editor] Preload failed:", error);
  });
}

/** Props that preload the editor on hover, focus or touch. */
export const editorPreloadProps = {
  onPointerEnter: preloadEditor,
  onFocus: preloadEditor,
  onTouchStart: preloadEditor,
} as const;
