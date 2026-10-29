import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useSheet } from "./useSheet";

function Sheet({ onClose }: { onClose: () => void }) {
  const { ref, handle, close } = useSheet<HTMLElement>(onClose);
  return (
    <section ref={ref} role="dialog">
      <header {...handle} data-testid="handle">
        <button type="button" onClick={close}>
          Done
        </button>
      </header>
    </section>
  );
}

// jsdom has no PointerEvent, so pointer events would lose their coordinates.
class TestPointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
    this.pointerType = init.pointerType ?? "touch";
  }
}
window.PointerEvent ??= TestPointerEvent as unknown as typeof PointerEvent;
// Nor pointer capture.
Element.prototype.setPointerCapture ??= () => undefined;

const drag = (target: Element, dy: number) => {
  fireEvent.pointerDown(target, { pointerId: 1, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(target, { pointerId: 1, clientX: 100, clientY: 100 + dy / 2 });
  fireEvent.pointerMove(target, { pointerId: 1, clientX: 100, clientY: 100 + dy });
  fireEvent.pointerUp(target, { pointerId: 1, clientX: 100, clientY: 100 + dy });
};

describe("useSheet", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("slides away, then closes once", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<Sheet onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("dialog").style.transform).toBe("translateY(100%)");
    expect(onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the header is pulled well down, and springs back from a nudge", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<Sheet onClose={onClose} />);
    const sheet = screen.getByRole("dialog");

    drag(screen.getByTestId("handle"), 30);
    expect(sheet.style.transform).toBe("");
    vi.advanceTimersByTime(250);
    expect(onClose).not.toHaveBeenCalled();

    drag(screen.getByTestId("handle"), 200);
    vi.advanceTimersByTime(250);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
