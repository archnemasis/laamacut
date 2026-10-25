import "../../test/install-local-storage-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useUIStore } from "../../stores/ui-store";

const actions = vi.hoisted(() => ({
  splitTimelineItem: vi.fn(async () => undefined),
  deleteTimelineItem: vi.fn(async () => undefined),
  duplicateTimelineItem: vi.fn(async () => undefined),
  getSplittableTimelineItemIds: vi.fn((_project: unknown, ids: string[]) => ids),
}));
vi.mock("../../utils/timeline-item-actions", () => actions);

const projectState = vi.hoisted(() => ({
  project: {
    settings: { width: 1920, height: 1080, frameRate: 30 },
    mediaLibrary: { items: [{ id: "m-video", type: "video" }] },
    timeline: {
      duration: 7,
      tracks: [{ id: "t1", clips: [{ id: "clip-1", mediaId: "m-video" }] }],
    },
  },
  undo: () => undefined,
  redo: () => undefined,
  canUndo: () => false,
  canRedo: () => false,
  updateSettings: async () => undefined,
  setCanvasBackground: () => undefined,
}));
vi.mock("../../stores/project-store", () => {
  const useProjectStore = (selector: (s: typeof projectState) => unknown) => selector(projectState);
  useProjectStore.getState = () => projectState;
  return { useProjectStore };
});

vi.mock("./Toolbar", () => ({ Toolbar: () => <header>Top bar</header> }));
vi.mock("./PhoneTextEditor", () => ({ PhoneTextEditor: () => <div>Text editor</div> }));
vi.mock("./inspector/VoiceOverPanel", () => ({ VoiceOverPanel: () => <div>Record</div> }));
vi.mock("../phone/PhoneMediaPicker", () => ({ PhoneMediaPicker: () => <div>Media picker</div> }));
vi.mock("./Preview", () => ({ Preview: () => <div>Preview</div> }));
vi.mock("./Timeline", () => ({ Timeline: () => <div>Timeline</div> }));
vi.mock("./AssetsPanel", () => ({
  AssetsPanel: ({ tab }: { tab: string }) => <div data-testid="assets-panel">{tab}</div>,
}));
vi.mock("./PhoneClipPanels", () => ({
  PhoneClipPanel: ({ panel, onDone }: { panel: string; onDone: () => void }) => (
    <section role="dialog" aria-label={panel}>
      <button type="button" onClick={onDone}>Done</button>
    </section>
  ),
}));
vi.mock("./InspectorPanel", () => ({
  InspectorPanel: ({ only }: { only?: string }) => <div data-testid="inspector-panel">{only ?? "all"}</div>,
}));

import { PhoneEditor } from "./PhoneEditor";

describe("PhoneEditor", () => {
  beforeEach(() => useUIStore.setState({ selectedItems: [] }));
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opens editor tools as bottom sheets", () => {
    render(<PhoneEditor />);
    const tools = screen.getByRole("navigation", { name: "Editor tools" });
    expect(within(tools).queryByText(/AI/)).toBeNull();

    // Like CapCut, Text opens a second row of text tools.
    fireEvent.click(within(tools).getByRole("button", { name: "Text" }));
    const textTools = screen.getByRole("navigation", { name: "Text tools" });
    expect(within(textTools).getByRole("button", { name: "Add text" })).toBeInTheDocument();

    fireEvent.click(within(textTools).getByRole("button", { name: "Text template" }));
    expect(screen.getByRole("dialog", { name: "Text template" })).toBeInTheDocument();
    expect(screen.getByTestId("assets-panel")).toHaveTextContent("text");

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Back to all tools" }));
    expect(screen.getByRole("navigation", { name: "Editor tools" })).toBeInTheDocument();
  });

  it("swaps to clip tools when a clip is selected", () => {
    useUIStore.setState({ selectedItems: [{ type: "clip", id: "clip-1" }] });
    render(<PhoneEditor />);
    const tools = screen.getByRole("navigation", { name: "Clip tools" });

    // Clip tools open CapCut-style panels over the bottom bar.
    fireEvent.click(within(tools).getByRole("button", { name: "Speed" }));
    expect(screen.getByRole("dialog", { name: "speed" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    // Transform opens a second row with Rotate, Mirror and Basic.
    fireEvent.click(within(tools).getByRole("button", { name: "Transform" }));
    const transform = screen.getByRole("navigation", { name: "Clip tools" });
    expect(within(transform).getByRole("button", { name: "Mirror" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to clip tools" }));

    fireEvent.click(within(tools).getByRole("button", { name: "Split" }));
    expect(actions.splitTimelineItem).toHaveBeenCalledWith(projectState, "clip-1", expect.any(Number));

    fireEvent.click(screen.getByRole("button", { name: "Back to editor tools" }));
    expect(useUIStore.getState().selectedItems).toEqual([]);
  });
});
