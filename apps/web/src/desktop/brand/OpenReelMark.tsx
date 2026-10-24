import type { JSX } from "react";
import llamaUrl from "../../assets/laamacut-llama.png?url";

export function OpenReelMark({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}): JSX.Element {
  const dimension = Number.isFinite(size) && size > 0 ? size : 24;
  return (
    <img
      src={llamaUrl}
      width={dimension}
      height={dimension}
      className={className}
      alt="Laamacut"
      draggable={false}
    />
  );
}
