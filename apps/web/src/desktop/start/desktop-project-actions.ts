import { useProjectStore } from "../../stores/project-store";
import { autoSaveManager, checkForRecovery, type AutoSaveMetadata } from "../../services/auto-save";
import { getProjectPreview, removeProjectPreview, type ProjectPreview } from "../../services/project-previews";
import { NEW_PROJECT_SETTINGS, newProjectName } from "../../services/new-project";

export interface NewProjectFormat {
  id: string;
  label: string;
  width: number;
  height: number;
  frameRate: number;
}

export const DESKTOP_FORMATS: NewProjectFormat[] = [
  { id: "vertical", label: "Vertical", width: 1080, height: 1920, frameRate: 30 },
  { id: "horizontal", label: "Horizontal", width: 1920, height: 1080, frameRate: 30 },
  { id: "square", label: "Square", width: 1080, height: 1080, frameRate: 30 },
];

export function startNewProject(): void {
  useProjectStore.getState().createNewProject(newProjectName(), NEW_PROJECT_SETTINGS);
}

export function startNewMotionProject(format: NewProjectFormat): void {
  useProjectStore.getState().createNewProject(`${format.label} Motion Creator`, {
    width: format.width,
    height: format.height,
    frameRate: format.frameRate,
  });
}

export interface RecentEntry {
  id: string;
  projectId: string;
  name: string;
  savedAt: number;
  preview?: ProjectPreview;
}

export async function listRecentProjects(): Promise<RecentEntry[]> {
  const saves = await checkForRecovery();
  const latestByProject = new Map<string, AutoSaveMetadata>();

  for (const save of saves) {
    if (!latestByProject.has(save.projectId)) {
      latestByProject.set(save.projectId, save);
    }
  }

  return Array.from(latestByProject.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 10)
    .map((save) => ({
      id: save.id,
      projectId: save.projectId,
      name: save.projectName,
      savedAt: save.timestamp,
      preview: getProjectPreview(save.projectId),
    }));
}

/** Deletes every auto-save of a project, removing it from Recent. */
export async function deleteRecentProject(projectId: string): Promise<void> {
  await autoSaveManager.initialize();
  await autoSaveManager.clearProjectSaves(projectId);
  removeProjectPreview(projectId);
}

export async function openRecentProject(saveId: string): Promise<boolean> {
  return useProjectStore.getState().recoverFromAutoSave(saveId);
}
