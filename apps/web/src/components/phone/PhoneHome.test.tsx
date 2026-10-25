import "../../test/install-local-storage-mock";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const actions = vi.hoisted(() => ({
  listRecentProjects: vi.fn(async () => [{ id: "s1", projectId: "p1", name: "Holiday", savedAt: Date.now() }]),
  openRecentProject: vi.fn(async () => true),
  startNewProject: vi.fn(),
  deleteRecentProject: vi.fn(async () => undefined),
}));
vi.mock("../../desktop/start/desktop-project-actions", () => actions);
const navigate = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/use-router", () => ({ useRouter: () => ({ navigate }) }));
vi.mock("../editor/settings/SettingsDialog", () => ({ SettingsDialog: () => null }));

import { PhoneHome } from "./PhoneHome";
import { takePhoneMediaPickerRequest } from "../../services/phone-media";

describe("PhoneHome", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("starts a new project straight into the media picker", () => {
    render(<PhoneHome />);
    fireEvent.click(screen.getByRole("button", { name: "New project" }));
    expect(actions.startNewProject).toHaveBeenCalled();
    expect(takePhoneMediaPickerRequest()).toBe(true);
    expect(navigate).toHaveBeenCalledWith("editor");
  });

  it("opens and deletes saved projects", async () => {
    render(<PhoneHome />);
    fireEvent.click(await screen.findByRole("button", { name: "Open Holiday" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("editor"));
    expect(actions.openRecentProject).toHaveBeenCalledWith("s1");

    fireEvent.click(screen.getByRole("button", { name: "Delete Holiday" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Open Holiday" })).toBeNull());
    expect(actions.deleteRecentProject).toHaveBeenCalledWith("p1");
  });
});
