import type {
  Template,
  TemplateSummary,
  ScriptableTemplate,
} from "@openreel/core";

export interface CloudTemplate extends TemplateSummary {
  author?: string;
}

/**
 * Laamacut keeps templates on this device. The upstream editor listed and
 * uploaded them through its own server; this keeps the same shape for callers
 * but never connects anywhere, so nothing from a project leaves the device.
 */
export class TemplateCloudService {
  async listTemplates(): Promise<CloudTemplate[]> {
    return [];
  }

  async getTemplate(_id: string): Promise<Template | null> {
    return null;
  }

  async uploadTemplate(
    _template: Template,
  ): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: "Templates are saved on this device only" };
  }

  async deleteTemplate(
    _id: string,
  ): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: "Templates are saved on this device only" };
  }

  async checkHealth(): Promise<boolean> {
    return false;
  }

  async listScriptableTemplates(): Promise<ScriptableTemplate[]> {
    return [];
  }

  async getScriptableTemplate(_id: string): Promise<ScriptableTemplate | null> {
    return null;
  }
}

export const templateCloudService = new TemplateCloudService();
