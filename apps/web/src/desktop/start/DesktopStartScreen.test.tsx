import "../../test/install-local-storage-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { useUIStore } from "../../stores/ui-store";

const actionMocks = vi.hoisted(() => ({
  listRecentProjects: vi.fn(),
  openRecentProject: vi.fn(),
  startNewProject: vi.fn(),
}));

vi.mock("./desktop-project-actions", async () => {
  const actual = await vi.importActual<typeof import("./desktop-project-actions")>(
    "./desktop-project-actions",
  );
  return {
    ...actual,
    listRecentProjects: actionMocks.listRecentProjects,
    openRecentProject: actionMocks.openRecentProject,
    startNewProject: actionMocks.startNewProject,
  };
});

import { DesktopStartScreen } from "./DesktopStartScreen";

describe("DesktopStartScreen", () => {
  beforeEach(() => {
    window.localStorage.clear();
    actionMocks.listRecentProjects.mockResolvedValue([]);
    actionMocks.openRecentProject.mockResolvedValue(true);
    actionMocks.startNewProject.mockReset();
    useUIStore.setState({ desktopPage: "edit" });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("creates a project straight away from the Create project button", async () => {
    render(<DesktopStartScreen />);
    await screen.findByText("No recent projects yet. Start a new project above.");

    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    expect(actionMocks.startNewProject).toHaveBeenCalledTimes(1);
    expect(useUIStore.getState().desktopPage).toBe("edit");
  });

  it("does not offer a Motion Creator project mode", async () => {
    render(<DesktopStartScreen />);
    await screen.findByText("No recent projects yet. Start a new project above.");

    expect(screen.queryByText("Motion Creator")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
