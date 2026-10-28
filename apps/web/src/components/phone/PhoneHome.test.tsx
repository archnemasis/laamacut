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
vi.mock("../editor/settings/GeneralPanel", () => ({ GeneralPanel: () => <div>Settings panel</div> }));

import { PhoneHome } from "./PhoneHome";
import { takePhoneMediaPickerRequest } from "../../services/phone-media";
import { DONATE_URL, LICENSE_TEXT } from "../../services/support-links";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

it("ships the repository's licence word for word", () => {
  const license = readFileSync(resolve(__dirname, "../../../../../LICENSE"), "utf8").replace(/\r\n/g, "\n");
  expect(LICENSE_TEXT.replace(/\s+/g, " ").trim()).toBe(license.replace(/\s+/g, " ").trim());
});

describe("PhoneHome", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("switches to the Me tab for settings", () => {
    render(<PhoneHome />);
    fireEvent.click(screen.getByRole("button", { name: "Me" }));
    expect(screen.getByText("Settings panel")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Me" })).toHaveAttribute("aria-current", "page");
  });

  it("links to donations and shows the licence on the Me tab", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<PhoneHome />);
    fireEvent.click(screen.getByRole("button", { name: "Me" }));
    fireEvent.click(screen.getByRole("button", { name: /Support Laamacut/ }));
    expect(open).toHaveBeenCalledWith(DONATE_URL, "_blank");

    fireEvent.click(screen.getByRole("button", { name: /About and licence/ }));
    expect(screen.getByText(/Augustus Otu and Contributors/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Settings panel")).toBeTruthy();
    open.mockRestore();
  });

  it("starts a new project straight into the media picker", () => {
    render(<PhoneHome />);
    fireEvent.click(screen.getByRole("button", { name: "New video" }));
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
