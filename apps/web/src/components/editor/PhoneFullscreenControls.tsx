import { useRef } from "react";
import { Minimize, Pause, Play } from "@/icons/lucide-compat";
import { useProjectStore } from "../../stores/project-store";
import { useTimelineStore } from "../../stores/timeline-store";

/** The project's length, measuring the clips too (a reopened project can report 0). */
function useProjectDuration(): number {
  return useProjectStore((s) =>
    Math.max(
      s.project.timeline.duration ?? 0,
      ...s.project.timeline.tracks.flatMap((t) => t.clips.map((c) => c.startTime + c.duration)),
      0,
    ),
  );
}

/**
 * Full screen preview controls, like CapCut: exit and play in the bottom left,
 * over a teal progress bar with a white handle to drag through the video.
 */
export function PhoneFullscreenControls({ onExit }: { onExit: () => void }) {
  const duration = useProjectDuration();
  const playheadPosition = useTimelineStore((s) => s.playheadPosition);
  const isPlaying = useTimelineStore((s) => s.playbackState === "playing");
  const togglePlayback = useTimelineStore((s) => s.togglePlayback);
  const barRef = useRef<HTMLDivElement>(null);
  const progress = duration > 0 ? Math.min(1, Math.max(0, playheadPosition / duration)) : 0;

  const seekToPointer = (clientX: number) => {
    const bar = barRef.current;
    if (!bar || duration <= 0) return;
    const rect = bar.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    useTimelineStore.getState().seekTo(fraction * duration);
  };

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/60 to-transparent px-4 pb-3 pt-6 text-white">
      <div
        ref={barRef}
        role="slider"
        aria-label="Playback position"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration * 10) / 10}
        aria-valuenow={Math.round(playheadPosition * 10) / 10}
        tabIndex={0}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          if (useTimelineStore.getState().playbackState === "playing") togglePlayback();
          seekToPointer(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture?.(e.pointerId)) seekToPointer(e.clientX);
        }}
        className="relative flex h-6 touch-none items-center"
      >
        <div className="h-1 w-full rounded-full bg-white/30">
          <div className="h-full rounded-full bg-accent" style={{ width: `${progress * 100}%` }} />
        </div>
        <div
          className="absolute h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-white shadow"
          style={{ left: `${progress * 100}%` }}
        />
      </div>
      <div className="mt-1 flex items-center gap-1">
        <button type="button" aria-label="Exit full screen" onClick={onExit} className="grid h-10 w-10 place-items-center">
          <Minimize size={20} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={isPlaying ? "Pause" : "Play"}
          onClick={() => togglePlayback()}
          className="grid h-10 w-10 place-items-center"
        >
          {isPlaying ? <Pause size={22} fill="currentColor" aria-hidden /> : <Play size={22} aria-hidden />}
        </button>
      </div>
    </div>
  );
}
