import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import type React from "react";
import { Button } from "@astryxdesign/core/Button";

import { DesktopApp } from "./DesktopApp";
import { useProjectStore } from "../stores/project-store";
import type { ProjectState } from "../stores/project-store";
import { useUIStore } from "../stores/ui-store";
import { useSettingsStore } from "../stores/settings-store";
import { useThemeStore } from "../stores/theme-store";

vi.mock("../stores/project-store", () => ({
  useProjectStore: vi.fn(),
}));

vi.mock("./editor/EditorBootstrapGate", () => ({
  EditorBootstrapGate: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("./pages/EditPage", () => ({
  EditPage: () => null,
}));

vi.mock("./editor/DesktopExportButton", () => ({
  DesktopExportButton: () => <Button label="Video Export" />,
}));

vi.mock("../components/editor/settings/SettingsDialog", () => ({
  SettingsDialog: () => <div data-testid="desktop-settings-dialog" />,
}));

const mockedUseProjectStore = vi.mocked(useProjectStore);

function mockHasProject(value: boolean): void {
  mockedUseProjectStore.mockImplementation((selector) =>
    selector({ hasOpenProject: value } as unknown as ProjectState),
  );
}

beforeEach(() => {
  useUIStore.setState({ desktopPage: "edit" });
  useSettingsStore.setState({ settingsOpen: false, settingsTab: "general" });
  (window as unknown as { openreel: unknown }).openreel = {
    platform: "desktop",
    win: { minimize: () => {}, toggleMaximize: () => {}, close: () => {}, isMaximized: async () => false },
  };
});
afterEach(() => {
  delete (window as unknown as { openreel?: unknown }).openreel;
  vi.clearAllMocks();
});

describe("DesktopApp", () => {
  it("applies the desktop theme class to its root", () => {
    mockHasProject(false);
    const { container } = render(<DesktopApp />);
    expect(container.querySelector(".openreel-desktop")).not.toBeNull();
  });

  it("puts the saved theme on <html> so portaled dialogs match", () => {
    useThemeStore.getState().setMode("amoled");
    mockHasProject(false);
    const { unmount } = render(<DesktopApp />);
    const root = document.documentElement;
    expect(root.classList.contains("openreel-desktop")).toBe(true);
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.dataset.theme).toBe("dark");
    expect(root.classList.contains("amoled")).toBe(true);
    unmount();
    expect(root.classList.contains("openreel-desktop")).toBe(false);
  });

  it("shows the start screen and hides the workspace when no project is open", () => {
    mockHasProject(false);
    const { getByText, queryByTestId } = render(<DesktopApp />);
    expect(getByText("New Project")).toBeTruthy();
    expect(queryByTestId("desktop-workspace")).toBeNull();
  });

  it("renders the title bar and workspace when a project is open", () => {
    mockHasProject(true);
    const { getByText, getByTestId } = render(<DesktopApp />);
    expect(getByText("Laamacut")).toBeTruthy();
    expect(getByTestId("desktop-workspace")).toBeTruthy();
  });

  it("puts Export beside the window buttons and has no AI Editor button", () => {
    mockHasProject(true);
    const view = render(<DesktopApp />);
    const exportButton = view.getByRole("button", { name: "Video Export" });
    const minimize = view.getByRole("button", { name: "Minimize" });
    expect(exportButton.parentElement?.parentElement).toBe(minimize.closest("header > div:last-child"));
    expect(view.queryByRole("button", { name: "AI Editor" })).toBeNull();
  });

  it("keeps Export available for stale motion state", () => {
    mockHasProject(true);
    useUIStore.setState({ desktopPage: "motion" });
    const view = render(<DesktopApp />);
    expect(view.getByRole("button", { name: "Video Export" })).toBeTruthy();
  });

  it("keeps settings reachable from the bottom-right button", () => {
    mockHasProject(false);
    const view = render(<DesktopApp />);

    fireEvent.click(view.getByRole("button", { name: "Settings" }));

    expect(useSettingsStore.getState().settingsOpen).toBe(true);
    expect(view.getByTestId("desktop-settings-dialog")).toBeTruthy();
  });
});
