import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useProjectStore } from "../../../stores/project-store";
import { GeneralPanel } from "./GeneralPanel";
import { useUIStore } from "../../../stores/ui-store";
import { keyboardShortcuts } from "../../../services/keyboard-shortcuts";
import { useThemeStore } from "../../../stores/theme-store";

describe("GeneralPanel project frame rate", () => {
  const originalUpdateSettings = useProjectStore.getState().updateSettings;
  const originalProject = useProjectStore.getState().project;
  const updateSettings = vi.fn();

  beforeEach(() => {
    updateSettings.mockResolvedValue({ success: true });
    useProjectStore.setState({
      project: {
        ...originalProject,
        settings: { ...originalProject.settings, frameRate: 30 },
      },
      hasOpenProject: true,
      updateSettings: updateSettings as unknown as typeof originalUpdateSettings,
    });
  });

  afterEach(() => {
    cleanup();
    updateSettings.mockReset();
    useProjectStore.setState({
      project: originalProject,
      hasOpenProject: false,
      updateSettings: originalUpdateSettings,
    });
  });

  it("changes the project editing timebase to 60 fps", () => {
    render(<GeneralPanel />);

    const selector = screen.getByRole("combobox", {
      name: "Editing frame rate",
    });
    expect(selector).toHaveValue("30");
    expect(screen.getByRole("option", { name: "60 fps" })).toBeTruthy();

    fireEvent.change(selector, { target: { value: "60" } });

    expect(updateSettings).toHaveBeenCalledWith({ frameRate: 60 });
  });
});

describe("GeneralPanel preferences", () => {
  afterEach(() => cleanup());

  it("turns timeline snapping off and hides the snap options", () => {
    useUIStore.getState().setSnapEnabled(true);
    render(<GeneralPanel />);
    expect(screen.getByRole("switch", { name: "Snap to playhead" })).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: "Snapping" }));
    expect(useUIStore.getState().snapSettings.enabled).toBe(false);
    expect(screen.queryByRole("switch", { name: "Snap to playhead" })).toBeNull();
  });

  it("changes preview quality and the shortcut layout", () => {
    render(<GeneralPanel />);
    fireEvent.change(screen.getByRole("combobox", { name: "Preview quality" }), { target: { value: "half" } });
    expect(useUIStore.getState().playbackQuality).toBe("half");
    fireEvent.change(screen.getByRole("combobox", { name: "Shortcut layout" }), { target: { value: "finalcut" } });
    expect(keyboardShortcuts.getActivePreset()).toBe("finalcut");
    keyboardShortcuts.applyPreset("openreel");
  });

  it("hides project settings when no project is open", () => {
    useProjectStore.setState({ hasOpenProject: false });
    render(<GeneralPanel />);
    expect(screen.queryByRole("combobox", { name: "Editing frame rate" })).toBeNull();
  });
});

describe("GeneralPanel appearance", () => {
  afterEach(() => {
    cleanup();
    useThemeStore.getState().setMode("dark");
  });

  it("switches between Dark, AMOLED black, Light and Match system", () => {
    useThemeStore.getState().setMode("dark");
    render(<GeneralPanel />);
    const choices = screen.getAllByRole("radio").map((radio) => radio.textContent);
    expect(choices).toEqual(["Dark", "AMOLED black", "Light", "Match system"]);

    fireEvent.click(screen.getByRole("radio", { name: "AMOLED black" }));
    expect(useThemeStore.getState().mode).toBe("amoled");
    expect(screen.getByRole("radio", { name: "AMOLED black" })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    expect(useThemeStore.getState().mode).toBe("light");
  });
});
