import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { OpenReelMark } from "./OpenReelMark";

describe("OpenReelMark", () => {
  it("renders the llama image at the requested size", () => {
    const { container } = render(<OpenReelMark size={48} />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("alt")).toBe("Laamacut");
    expect(img?.getAttribute("width")).toBe("48");
    expect(img?.getAttribute("height")).toBe("48");
  });

  it("falls back to 24px for an invalid size", () => {
    const { container } = render(<OpenReelMark size={Number.NaN} />);
    expect(container.querySelector("img")?.getAttribute("width")).toBe("24");
  });
});
