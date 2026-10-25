import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PageBar } from "./PageBar";

describe("PageBar", () => {
  afterEach(() => cleanup());

  it("goes home, delivers and opens settings while a project is open", () => {
    const onHome = vi.fn();
    const onDeliver = vi.fn();
    const onSettings = vi.fn();
    render(<PageBar hasProject onHome={onHome} onDeliver={onDeliver} onSettings={onSettings} />);

    expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "Deliver" }));
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(onDeliver).toHaveBeenCalledTimes(1);
    expect(onHome).toHaveBeenCalledTimes(1);
    expect(onSettings).toHaveBeenCalledTimes(1);
  });

  it("marks Home as the current page and disables Edit and Deliver with no project", () => {
    render(<PageBar hasProject={false} onHome={() => {}} onDeliver={() => {}} onSettings={() => {}} />);
    expect(screen.getByRole("button", { name: "Home" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deliver" })).toBeDisabled();
  });
});
