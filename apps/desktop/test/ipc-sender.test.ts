import { describe, it, expect } from "vitest";
import { isAppUrl } from "../src/main/ipc";

describe("isAppUrl", () => {
  it("accepts the app's own pages", () => {
    expect(isAppUrl("app://openreel/index.html")).toBe(true);
    expect(isAppUrl("app://openreel/editor#x")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isAppUrl("https://example.com/")).toBe(false);
    expect(isAppUrl("app://other/index.html")).toBe(false);
    expect(isAppUrl("file:///C:/index.html")).toBe(false);
    expect(isAppUrl("")).toBe(false);
  });
});
