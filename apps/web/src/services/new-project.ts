// New projects start straight away, like CapCut: a 16:9 canvas you can change
// from the editor's ratio menu, and a placeholder name you replace at export.
export const NEW_PROJECT_SETTINGS = { width: 1920, height: 1080, frameRate: 30 };

export function newProjectName(now: Date = new Date()): string {
  const day = now.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const time = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `Project ${day} ${time}`;
}
