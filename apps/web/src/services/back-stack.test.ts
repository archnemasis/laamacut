import { describe, expect, it, vi } from "vitest";
import { handleBack, registerBackHandler } from "./back-stack";

describe("back stack", () => {
  it("does nothing, and lets the app exit, when no layer is open", () => {
    expect(handleBack()).toBe(false);
  });

  it("closes the latest layer first, then the one beneath, higher priority first", () => {
    const calls: string[] = [];
    const home = registerBackHandler(() => calls.push("home"), 0);
    const sheet = registerBackHandler(() => calls.push("sheet"));
    const text = registerBackHandler(() => calls.push("text"));
    const exporting = registerBackHandler(() => calls.push("export"), 50);
    expect(handleBack()).toBe(true);
    exporting();
    handleBack();
    text();
    handleBack();
    sheet();
    handleBack();
    home();
    expect(calls).toEqual(["export", "text", "sheet", "home"]);
    expect(handleBack()).toBe(false);
  });

  it("stops handling once unregistered", () => {
    const run = vi.fn();
    registerBackHandler(run)();
    expect(handleBack()).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });
});
