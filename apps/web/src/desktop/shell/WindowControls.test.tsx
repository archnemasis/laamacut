import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WindowControls } from "./WindowControls";

const win = { minimize: vi.fn(), toggleMaximize: vi.fn(), close: vi.fn(), isMaximized: vi.fn().mockResolvedValue(false) };

beforeEach(() => {
  (window as unknown as { openreel: unknown }).openreel = { platform: "desktop", win };
});
afterEach(() => {
  delete (window as unknown as { openreel?: unknown }).openreel;
  vi.clearAllMocks();
});

describe("WindowControls", () => {
  it("renders nothing on macOS (native traffic lights)", () => {
    const { container } = render(<WindowControls platform="darwin" />);
    expect(container.firstChild).toBeNull();
  });
  it("renders min/max/close on win32 and wires them", () => {
    render(<WindowControls platform="win32" />);
    fireEvent.click(screen.getByLabelText("Minimize"));
    fireEvent.click(screen.getByLabelText("Close"));
    expect(win.minimize).toHaveBeenCalledTimes(1);
    expect(win.close).toHaveBeenCalledTimes(1);
  });
  it("shows Maximize while restored and toggles on click", async () => {
    render(<WindowControls platform="win32" />);
    fireEvent.click(await screen.findByLabelText("Maximize"));
    expect(win.toggleMaximize).toHaveBeenCalledTimes(1);
  });
  it("shows Restore Down while maximized and updates after a resize", async () => {
    win.isMaximized.mockResolvedValue(true);
    render(<WindowControls platform="win32" />);
    expect(await screen.findByLabelText("Restore Down")).toBeInTheDocument();
    win.isMaximized.mockResolvedValue(false);
    fireEvent(window, new Event("resize"));
    expect(await screen.findByLabelText("Maximize")).toBeInTheDocument();
  });
});
