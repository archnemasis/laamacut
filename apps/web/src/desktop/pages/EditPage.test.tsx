import "../../test/install-local-storage-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useUIStore } from "../../stores/ui-store";

vi.mock("../../components/editor/AssetsPanel", () => ({
  AssetsPanel: ({ tab }: { tab?: string }) => <div>Media panel {tab}</div>,
}));
vi.mock("../../components/editor/InspectorPanel", () => ({
  InspectorPanel: () => <div>Inspector panel</div>,
}));
vi.mock("../../components/editor/Preview", () => ({
  Preview: () => <div>Preview panel</div>,
}));
vi.mock("../../components/editor/Timeline", () => ({
  Timeline: () => <div>Timeline panel</div>,
}));

import { EditPage } from "./EditPage";

describe("EditPage layout", () => {
  beforeEach(() => {
    // A layout saved while the old AI Editor dock was open must not bring it back.
    const panels = useUIStore.getState().panels;
    useUIStore.setState({
      panels: {
        ...panels,
        agentChat: { ...panels.agentChat, visible: true },
      },
    });
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("shows media, viewer, inspector and timeline with no AI chat dock", async () => {
    render(<EditPage />);

    expect(await screen.findByText("Preview panel")).toBeTruthy();
    expect(screen.getByText("Media panel media")).toBeTruthy();
    expect(screen.getByText("Inspector panel")).toBeTruthy();
    expect(screen.getByTestId("desktop-edit-page").style.gridTemplateAreas).not.toContain(
      "chat",
    );
  });

  it("shows and hides panels from the Resolve-style interface toolbar", async () => {
    render(<EditPage />);
    await screen.findByText("Preview panel");

    fireEvent.click(screen.getByRole("button", { name: "Effects" }));
    expect(screen.getByText("Media panel effects")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Effects" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Effects" }));
    expect(screen.queryByText(/Media panel/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Inspector" }));
    expect(screen.queryByText("Inspector panel")).toBeNull();
    expect(screen.getByTestId("desktop-edit-page").style.gridTemplateAreas).toBe("'stage' 'timeline'");
  });
});
