import type { JSX } from "react";
import type React from "react";
import { useEffect, useState } from "react";

// Windows-style caption glyphs: thin 10px line art, like the native buttons.
const GLYPHS = {
  minimize: <path d="M0 5.5h10" />,
  maximize: <rect x="0.5" y="0.5" width="9" height="9" />,
  restore: (
    <>
      <path d="M2.5 2.5V0.5h7v7h-2" />
      <rect x="0.5" y="2.5" width="7" height="7" />
    </>
  ),
  close: <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" />,
};

function CaptionButton({
  label,
  glyph,
  onClick,
  isClose = false,
}: {
  label: string;
  glyph: keyof typeof GLYPHS;
  onClick: () => void;
  isClose?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid h-10 w-[46px] place-items-center text-fg-2 outline-none transition-colors ${
        isClose
          ? "hover:bg-red-600 hover:text-white focus-visible:bg-red-600 focus-visible:text-white"
          : "hover:bg-hover hover:text-fg focus-visible:bg-hover"
      }`}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden>
        {GLYPHS[glyph]}
      </svg>
    </button>
  );
}

export function WindowControls({ platform }: { platform: string }): JSX.Element | null {
  const api = typeof window !== "undefined" ? window.openreel?.win : undefined;
  const [isMaximized, setIsMaximized] = useState(false);

  // Maximizing or restoring always resizes the page, so re-read the state then.
  useEffect(() => {
    if (!api || platform === "darwin") return;
    let active = true;
    const sync = () => {
      void api.isMaximized().then((maximized) => {
        if (active) setIsMaximized(maximized);
      });
    };
    sync();
    window.addEventListener("resize", sync);
    return () => {
      active = false;
      window.removeEventListener("resize", sync);
    };
  }, [api, platform]);

  if (platform === "darwin" || !api) return null;
  return (
    <div className="flex items-center self-start" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
      <CaptionButton label="Minimize" glyph="minimize" onClick={() => void api.minimize()} />
      <CaptionButton
        label={isMaximized ? "Restore Down" : "Maximize"}
        glyph={isMaximized ? "restore" : "maximize"}
        onClick={() => void api.toggleMaximize()}
      />
      <CaptionButton label="Close" glyph="close" onClick={() => void api.close()} isClose />
    </div>
  );
}
