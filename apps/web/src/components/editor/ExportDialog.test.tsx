import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SourceExportMatch } from "../../services/export-source-match";
import { ExportDialog } from "./ExportDialog";
import { checkBrowserExportCapability } from "@openreel/core";

vi.mock("@openreel/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@openreel/core")>();
  return {
    ...actual,
    checkBrowserExportCapability: vi.fn(() => new Promise<never>(() => undefined)),
    estimateExportTime: vi.fn(() => null),
    getCodecRecommendations: vi.fn(() => []),
    getDeviceProfile: vi.fn(() => new Promise<never>(() => undefined)),
  };
});

const SOURCE_MATCH: SourceExportMatch = {
  width: 4000,
  height: 2400,
  frameRate: 30,
  bitrate: 60_000,
  sourceName: "source-match.mp4",
};

describe("ExportDialog", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(checkBrowserExportCapability).mockImplementation(() => new Promise<never>(() => undefined));
  });

  it("keeps the source-match shortcut in the presets view", () => {
    render(
      <ExportDialog
        isOpen
        onClose={vi.fn()}
        onExport={vi.fn()}
        duration={1}
        sourceMatch={SOURCE_MATCH}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Presets" }));
    expect(screen.getByTestId("quick-export-card")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Advanced" }));

    expect(screen.queryByTestId("quick-export-card")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Quality & encoding" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Audio" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Enhance quality" }),
    ).toBeInTheDocument();
  });

  it("exports source settings from the quick action", () => {
    const onClose = vi.fn();
    const onExport = vi.fn();

    render(
      <ExportDialog
        isOpen
        onClose={onClose}
        onExport={onExport}
        duration={1}
        sourceMatch={SOURCE_MATCH}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Presets" }));
    fireEvent.click(screen.getByRole("button", { name: "Quick Export" }));

    expect(onExport).toHaveBeenCalledWith(
      expect.objectContaining({
        format: "mp4",
        codec: "h264",
        width: 4000,
        height: 2400,
        frameRate: 30,
        bitrate: 60_000,
      }),
      "download",
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("defaults to the project's dimensions and frame rate with a usable export action", () => {
    const onExport = vi.fn();
    render(<ExportDialog isOpen onClose={vi.fn()} onExport={onExport} duration={5} projectWidth={1080} projectHeight={1920} frameRate={24} />);
    fireEvent.click(screen.getByRole("button", { name: "Export Video" }));
    expect(onExport).toHaveBeenCalledWith(expect.objectContaining({ width: 1080, height: 1920, frameRate: 24, format: "mp4", codec: "h264" }), "download");
  });

  it("updates custom output dimensions when switching to a different project", () => {
    const onExport = vi.fn();
    const { rerender } = render(<ExportDialog isOpen onClose={vi.fn()} onExport={onExport} duration={5} />);
    fireEvent.click(screen.getByRole("radio", { name: "Advanced" }));
    rerender(<ExportDialog isOpen onClose={vi.fn()} onExport={onExport} duration={5} projectWidth={1080} projectHeight={1920} frameRate={60} />);
    fireEvent.click(screen.getByRole("button", { name: "Export Video" }));
    expect(onExport).toHaveBeenCalledWith(expect.objectContaining({ width: 1080, height: 1920, frameRate: 60 }), "download");
  });

  it("prevents empty timeline exports through both normal and quick actions", () => {
    const onExport = vi.fn();
    render(<ExportDialog isOpen onClose={vi.fn()} onExport={onExport} duration={0} sourceMatch={SOURCE_MATCH} />);
    expect(screen.getByRole("button", { name: "Export Video" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Presets" }));
    expect(screen.getByRole("button", { name: "Export Video" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Quick Export" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Add a clip");
    expect(onExport).not.toHaveBeenCalled();
  });

  it("exports the chosen In/Out section through the normal and quick actions", () => {
    const onExport = vi.fn();
    render(<ExportDialog isOpen onClose={vi.fn()} onExport={onExport} duration={6} markedRange={{ startTime: 2, endTime: 4 }} sourceMatch={SOURCE_MATCH} />);
    fireEvent.click(screen.getByRole("radio", { name: "Marked In/Out" }));
    fireEvent.click(screen.getByRole("button", { name: "Export Video" }));
    expect(onExport).toHaveBeenLastCalledWith(expect.objectContaining({ range: { startTime: 2, endTime: 4 } }), "download");
    fireEvent.click(screen.getByRole("radio", { name: "Presets" }));
    fireEvent.click(screen.getByRole("button", { name: "Quick Export" }));
    expect(onExport).toHaveBeenLastCalledWith(expect.objectContaining({ range: { startTime: 2, endTime: 4 } }), "download");
    fireEvent.click(screen.getByRole("radio", { name: "Entire timeline" }));
    fireEvent.click(screen.getByRole("button", { name: "Export Video" }));
    expect(onExport).toHaveBeenLastCalledWith(expect.objectContaining({ range: undefined }), "download");
  });

  it("disables section export until valid In and Out points exist", () => {
    const { rerender } = render(<ExportDialog isOpen onClose={vi.fn()} onExport={vi.fn()} duration={6} />);
    expect(screen.getByRole("radio", { name: "Marked In/Out" })).toBeDisabled();
    rerender(<ExportDialog isOpen onClose={vi.fn()} onExport={vi.fn()} duration={6} markedRange={{ startTime: 2, endTime: 7 }} />);
    expect(screen.getByRole("radio", { name: "Marked In/Out" })).toBeDisabled();
  });

  it("keeps audio-only presets out of the video export flow", () => {
    render(<ExportDialog isOpen onClose={vi.fn()} onExport={vi.fn()} duration={5} />);
    expect(screen.queryByText("Audio", { selector: "button" })).not.toBeInTheDocument();
    expect(screen.queryByText("MP3 High Quality")).not.toBeInTheDocument();
  });

  it("shows the browser's codec failure and blocks the export action", async () => {
    vi.mocked(checkBrowserExportCapability).mockResolvedValue({ supported: false, reason: "This browser cannot encode H.264. Try WebM." });
    const onExport = vi.fn();
    render(<ExportDialog isOpen onClose={vi.fn()} onExport={onExport} duration={5} />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Try WebM"));
    expect(screen.getByRole("button", { name: "Export Video" })).toBeDisabled();
    expect(onExport).not.toHaveBeenCalled();
  });

  it("recommends a small source without upscaling or suggesting native-only codecs", () => {
    render(<ExportDialog isOpen onClose={vi.fn()} onExport={vi.fn()} duration={5} projectWidth={640} projectHeight={360} frameRate={24} />);
    fireEvent.click(screen.getByRole("radio", { name: "Presets" }));
    expect(screen.getByRole("checkbox", { name: "Project settings" })).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "YouTube 4K" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "4K ProRes HQ" })).not.toBeInTheDocument();
  });

  describe("export name", () => {
    it("renames the project before exporting", async () => {
      const calls: string[] = [];
      const onRename = vi.fn(async (name: string) => { calls.push(`rename:${name}`); });
      const onExport = vi.fn(() => { calls.push("export"); });
      render(<ExportDialog isOpen onClose={vi.fn()} onExport={onExport} onRename={onRename} projectName="Project Oct 24 21:30" duration={5} />);
      expect(screen.getByLabelText("Name")).toHaveValue("Project Oct 24 21:30");
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  My trip  " } });
      fireEvent.click(screen.getByRole("button", { name: "Export Video" }));
      await waitFor(() => expect(onExport).toHaveBeenCalled());
      expect(calls).toEqual(["rename:My trip", "export"]);
    });

    it("skips renaming when the name is unchanged or blank", () => {
      const onRename = vi.fn();
      const onExport = vi.fn();
      render(<ExportDialog isOpen onClose={vi.fn()} onExport={onExport} onRename={onRename} projectName="Holiday" duration={5} />);
      fireEvent.click(screen.getByRole("button", { name: "Export Video" }));
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "   " } });
      expect(onRename).not.toHaveBeenCalled();
      expect(onExport).toHaveBeenCalledTimes(1);
    });

    it("hides the Name field when renaming isn't wired up", () => {
      render(<ExportDialog isOpen onClose={vi.fn()} onExport={vi.fn()} duration={5} />);
      expect(screen.queryByLabelText("Name")).toBeNull();
    });
  });

  describe("CapCut-style export panel", () => {
    it("opens first and exports the project size at the recommended bitrate", () => {
      const onExport = vi.fn();
      render(<ExportDialog isOpen onClose={vi.fn()} onExport={onExport} duration={5} projectWidth={1920} projectHeight={1080} frameRate={30} />);
      expect(screen.getByRole("radio", { name: "Export" })).toBeChecked();
      fireEvent.click(screen.getByRole("button", { name: "Export Video" }));
      expect(onExport).toHaveBeenCalledWith(expect.objectContaining({
        format: "mp4", codec: "h264", width: 1920, height: 1080, frameRate: 30, bitrate: 7500, keyframeInterval: 60,
      }), "download");
    });

    it("applies the chosen resolution, bitrate level, format and frame rate", () => {
      const onExport = vi.fn();
      render(<ExportDialog isOpen onClose={vi.fn()} onExport={onExport} duration={5} projectWidth={1080} projectHeight={1920} frameRate={30} />);
      fireEvent.change(screen.getByLabelText("Resolution"), { target: { value: "720" } });
      fireEvent.change(screen.getByLabelText("Bitrate"), { target: { value: "higher" } });
      fireEvent.change(screen.getByLabelText("Format"), { target: { value: "mov" } });
      fireEvent.change(screen.getByLabelText("Frame rate"), { target: { value: "120" } });
      fireEvent.click(screen.getByRole("button", { name: "Export Video" }));
      expect(onExport).toHaveBeenCalledWith(expect.objectContaining({
        format: "mov", width: 720, height: 1280, frameRate: 120, bitrate: 26500, keyframeInterval: 240,
      }), "download");
    });

    it("exports a custom bitrate", () => {
      const onExport = vi.fn();
      render(<ExportDialog isOpen onClose={vi.fn()} onExport={onExport} duration={5} />);
      fireEvent.change(screen.getByLabelText("Bitrate"), { target: { value: "custom" } });
      fireEvent.change(screen.getByLabelText("Custom bitrate (kbps)"), { target: { value: "42000" } });
      fireEvent.click(screen.getByRole("button", { name: "Export Video" }));
      expect(onExport).toHaveBeenCalledWith(expect.objectContaining({ bitrate: 42000 }), "download");
    });

    it("disables HEVC and keeps H.264 when the browser can't encode it", async () => {
      vi.mocked(checkBrowserExportCapability).mockImplementation(async (settings) =>
        settings.codec === "h265"
          ? { supported: false, reason: "no HEVC" }
          : { supported: true, reason: null });
      const onExport = vi.fn();
      render(<ExportDialog isOpen onClose={vi.fn()} onExport={onExport} duration={5} />);
      const hevc = await screen.findByRole("option", { name: "HEVC (not supported here)" });
      expect(hevc).toBeDisabled();
      expect(screen.getByLabelText("Codec")).toHaveValue("h264");
    });

    it("exports HEVC when the browser supports it", async () => {
      vi.mocked(checkBrowserExportCapability).mockResolvedValue({ supported: true, reason: null });
      const onExport = vi.fn();
      render(<ExportDialog isOpen onClose={vi.fn()} onExport={onExport} duration={5} />);
      fireEvent.change(screen.getByLabelText("Codec"), { target: { value: "h265" } });
      await waitFor(() => expect(screen.getByRole("button", { name: "Export Video" })).toBeEnabled());
      fireEvent.click(screen.getByRole("button", { name: "Export Video" }));
      expect(onExport).toHaveBeenCalledWith(expect.objectContaining({ codec: "h265" }), "download");
    });
  });
});
