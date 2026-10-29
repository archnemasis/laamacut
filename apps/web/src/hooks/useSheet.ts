import { useCallback, useRef } from "react";
import type React from "react";

const reduceMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Movement before a press on the header counts as a drag rather than a tap. */
const SLOP = 10;

/**
 * A phone bottom sheet that slides away when it closes and can be dragged
 * down by its header to close. Put `ref` on the sheet, spread `handle` on the
 * header and call `close` instead of `onClose`. Buttons and tabs inside the
 * header still tap and scroll normally.
 */
export function useSheet<T extends HTMLElement = HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  const latest = useRef(onClose);
  latest.current = onClose;
  const closing = useRef(false);
  const drag = useRef<{ id: number; x: number; y: number; dy: number; lastY: number; lastT: number; speed: number; active: boolean } | null>(null);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    const sheet = ref.current;
    if (!sheet || reduceMotion()) return latest.current();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      latest.current();
    };
    sheet.style.transition = "transform 160ms cubic-bezier(0.4, 0, 1, 1)";
    sheet.style.transform = "translateY(100%)";
    sheet.addEventListener("transitionend", finish, { once: true });
    window.setTimeout(finish, 220);
  }, []);

  const settle = () => {
    const sheet = ref.current;
    if (!sheet) return;
    sheet.style.transition = "transform 180ms cubic-bezier(0.2, 0, 0, 1)";
    sheet.style.transform = "";
  };

  const handle = {
    // phone-editor.css gives everything inside the header touch-action: pan-x,
    // so a tab row that scrolls sideways still hands vertical drags to us.
    "data-sheet-handle": "",
    onPointerDown(e: React.PointerEvent<HTMLElement>) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dy: 0, lastY: e.clientY, lastT: e.timeStamp, speed: 0, active: false };
    },
    onPointerMove(e: React.PointerEvent<HTMLElement>) {
      const d = drag.current;
      const sheet = ref.current;
      if (!d || d.id !== e.pointerId || !sheet || closing.current) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.active) {
        // Sideways means the tab row is scrolling; upwards means nothing.
        if (Math.abs(dx) > SLOP && Math.abs(dx) > dy) drag.current = null;
        if (dy < SLOP || Math.abs(dx) > dy) return;
        d.active = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        sheet.style.transition = "none";
      }
      const dt = e.timeStamp - d.lastT;
      if (dt > 0) d.speed = (e.clientY - d.lastY) / dt;
      d.lastY = e.clientY;
      d.lastT = e.timeStamp;
      d.dy = Math.max(0, dy - SLOP);
      sheet.style.transform = `translateY(${d.dy}px)`;
    },
    onPointerUp(e: React.PointerEvent<HTMLElement>) {
      const d = drag.current;
      drag.current = null;
      if (!d?.active || d.id !== e.pointerId) return;
      // The finger lifted over a button; that is the end of a drag, not a tap.
      const swallow = (click: Event) => {
        click.stopPropagation();
        click.preventDefault();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
      const height = ref.current?.offsetHeight || 400;
      if (d.dy > Math.min(120, height * 0.3) || (d.speed > 0.6 && d.dy > 24)) close();
      else settle();
    },
    onPointerCancel() {
      if (drag.current?.active) settle();
      drag.current = null;
    },
  };

  return { ref, handle, close };
}
