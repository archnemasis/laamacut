import { create } from "zustand";

/**
 * The page picked in the bottom page bar, like Resolve's Media / Edit /
 * Color / Fairlight pages. Each one is a layout of the same editor panels.
 */
export type DesktopPage = "media" | "edit" | "color" | "audio";

interface DesktopPageState {
  page: DesktopPage;
  setPage(page: DesktopPage): void;
}

export const useDesktopPage = create<DesktopPageState>((set) => ({
  page: "edit",
  setPage: (page) => set({ page }),
}));
