import type { Project } from "@openreel/core";

// Small preview images for the start screen's recent projects, kept per
// project in localStorage and refreshed whenever the project auto-saves.

const STORAGE_KEY = "laamacut-project-previews";
const MAX_SIZE = 360;

export interface ProjectPreview {
  /** JPEG data URL of the first picture on the timeline, or null if it has none. */
  image: string | null;
  width: number;
  height: number;
}

function readAll(): Record<string, ProjectPreview> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, ProjectPreview>;
  } catch {
    return {};
  }
}

function writeAll(previews: Record<string, ProjectPreview>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(previews));
  } catch {
    // Storage full or blocked: previews are optional.
  }
}

export function getProjectPreview(projectId: string): ProjectPreview | undefined {
  return readAll()[projectId];
}

export function removeProjectPreview(projectId: string): void {
  const previews = readAll();
  delete previews[projectId];
  writeAll(previews);
}

/** The thumbnail URL of the earliest video or image clip on the timeline. */
export function firstPictureUrl(project: Project): string | null {
  const visualTrackIds = new Set(
    project.timeline.tracks.filter((track) => track.type === "video" || track.type === "image").map((track) => track.id),
  );
  const clips = project.timeline.tracks
    .filter((track) => visualTrackIds.has(track.id))
    .flatMap((track) => track.clips)
    .sort((a, b) => a.startTime - b.startTime);
  for (const clip of clips) {
    const media = project.mediaLibrary.items.find((item) => item.id === clip.mediaId);
    const url = media?.filmstripThumbnails?.[0]?.url ?? media?.thumbnailUrl;
    if (url) return url;
  }
  return null;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Preview image failed to load"));
    img.src = url;
  });
}

export async function captureProjectPreview(project: Project): Promise<void> {
  const { width, height } = project.settings;
  const url = firstPictureUrl(project);
  let image: string | null = null;
  if (url) {
    try {
      const picture = await loadImage(url);
      const scale = MAX_SIZE / Math.max(width, height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext("2d");
      if (ctx) {
        // Letterbox the picture into the project's shape, like the canvas does.
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const fit = Math.min(canvas.width / picture.width, canvas.height / picture.height);
        const w = picture.width * fit;
        const h = picture.height * fit;
        ctx.drawImage(picture, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        image = canvas.toDataURL("image/jpeg", 0.75);
      }
    } catch {
      image = null;
    }
  }
  const previews = readAll();
  previews[project.id] = { image, width, height };
  writeAll(previews);
}
