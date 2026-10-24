import { useProjectStore } from "../../stores/project-store";
import { checkForRecovery, type AutoSaveMetadata } from "../../services/auto-save";
import { PROJECT_FORMATS } from "../../components/welcome/project-formats";

export interface NewProjectFormat {
  id: string;
  label: string;
  width: number;
  height: number;
  frameRate: number;
}

export const DESKTOP_FORMATS: NewProjectFormat[] = PROJECT_FORMATS;

export function startNewProject(format: NewProjectFormat): void {
  useProjectStore.getState().createNewProject(format.label, {
    width: format.width,
    height: format.height,
    frameRate: format.frameRate,
  });
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
  name: string;
  savedAt: number;
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
      name: save.projectName,
      savedAt: save.timestamp,
    }));
}

export async function openRecentProject(saveId: string): Promise<boolean> {
  return useProjectStore.getState().recoverFromAutoSave(saveId);
}
