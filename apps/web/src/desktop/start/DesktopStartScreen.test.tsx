import "../../test/install-local-storage-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { useUIStore } from "../../stores/ui-store";

const actionMocks = vi.hoisted(() => ({
  listRecentProjects: vi.fn(),
  openRecentProject: vi.fn(),
  startNewProject: vi.fn(),
  deleteRecentProject: vi.fn(),
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
    deleteRecentProject: actionMocks.deleteRecentProject,
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
  it("shows recent projects as preview cards and deletes one after confirming", async () => {
    actionMocks.listRecentProjects.mockResolvedValue([
      { id: "a-slot-0", projectId: "a", name: "Trip", savedAt: Date.now(), preview: { image: "data:image/jpeg;base64,AAAA", width: 1920, height: 1080 } },
      { id: "b-slot-0", projectId: "b", name: "Blank", savedAt: Date.now() },
    ]);
    actionMocks.deleteRecentProject.mockResolvedValue(undefined);
    const { container } = render(<DesktopStartScreen />);
    await screen.findByRole("button", { name: "Open Trip" });
    expect(container.querySelector('img[src^="data:image/jpeg"]')).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Delete Trip" }));
    expect(actionMocks.deleteRecentProject).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Open Trip" })).toBeNull());
    expect(actionMocks.deleteRecentProject).toHaveBeenCalledWith("a");
    expect(screen.getByRole("button", { name: "Open Blank" })).toBeInTheDocument();
  });
});
