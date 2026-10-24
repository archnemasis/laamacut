import { create } from "zustand";
import { persist } from "zustand/middleware";

/** "amoled" is dark mode with pure-black surfaces for OLED screens. */
export type ThemeMode = "light" | "dark" | "amoled" | "auto";

interface ThemeState {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const getSystemTheme = (): "light" | "dark" => {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

const calculateIsDark = (mode: ThemeMode): boolean => {
  if (mode === "auto") {
    return getSystemTheme() === "dark";
  }
  return mode === "dark" || mode === "amoled";
};

/** Put the theme on <html> so portaled dialogs and menus match the app. */
export const applyThemeToDocument = (mode: ThemeMode, isDark: boolean): void => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", isDark);
  root.classList.toggle("amoled", mode === "amoled");
  root.dataset.theme = isDark ? "dark" : "light";
};

export const THEME_LABELS: Record<ThemeMode, string> = {
  dark: "Dark",
  amoled: "AMOLED black",
  light: "Light",
  auto: "Match system",
};

export const NEXT_MODE: Record<ThemeMode, ThemeMode> = {
  dark: "amoled",
  amoled: "light",
  light: "auto",
  auto: "dark",
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: "dark",
      isDark: true,

      setMode: (mode: ThemeMode) => {
        const isDark = calculateIsDark(mode);
        set({ mode, isDark });
        applyThemeToDocument(mode, isDark);
      },

      toggleTheme: () => {
        get().setMode(NEXT_MODE[get().mode]);
      },
    }),
    {
      name: "openreel-theme",
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isDark = calculateIsDark(state.mode);
          applyThemeToDocument(state.mode, state.isDark);
        }
      },
    },
  ),
);

if (typeof window !== "undefined") {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  mediaQuery.addEventListener("change", (e) => {
    const state = useThemeStore.getState();
    if (state.mode === "auto") {
      useThemeStore.setState({ isDark: e.matches });
      applyThemeToDocument("auto", e.matches);
    }
  });
}
