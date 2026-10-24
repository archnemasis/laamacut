import "../../test/install-local-storage-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useUIStore } from "../../stores/ui-store";

vi.mock("../../components/editor/AssetsPanel", () => ({
  AssetsPanel: () => <div>Media panel</div>,
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
    expect(screen.getByText("Media panel")).toBeTruthy();
    expect(screen.getByText("Inspector panel")).toBeTruthy();
    expect(screen.getByTestId("desktop-edit-page").style.gridTemplateAreas).not.toContain(
      "chat",
    );
  });
});
