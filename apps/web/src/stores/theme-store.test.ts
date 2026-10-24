import "../test/install-local-storage-mock";
import { afterEach, describe, expect, it } from "vitest";
import { NEXT_MODE, useThemeStore } from "./theme-store";

describe("theme store", () => {
  afterEach(() => useThemeStore.getState().setMode("dark"));

  it("puts AMOLED black on <html> as a dark theme with the amoled class", () => {
    useThemeStore.getState().setMode("amoled");
    const root = document.documentElement;
    expect(useThemeStore.getState().isDark).toBe(true);
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.classList.contains("amoled")).toBe(true);
    expect(root.dataset.theme).toBe("dark");
  });

  it("drops the dark and amoled classes in light mode", () => {
    useThemeStore.getState().setMode("amoled");
    useThemeStore.getState().setMode("light");
    const root = document.documentElement;
    expect(root.classList.contains("dark")).toBe(false);
    expect(root.classList.contains("amoled")).toBe(false);
    expect(root.dataset.theme).toBe("light");
  });

  it("cycles through every theme", () => {
    const seen = new Set<string>();
    let mode = useThemeStore.getState().mode;
    for (let i = 0; i < 4; i++) {
      seen.add(mode);
      mode = NEXT_MODE[mode];
    }
    expect([...seen].sort()).toEqual(["amoled", "auto", "dark", "light"]);
  });
});
