import { afterEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "./settings-store";

describe("settings store migrations", () => {
  afterEach(() => {
    localStorage.clear();
    useSettingsStore.setState({ autoSave: true, configuredServices: [] });
  });

  it("drops settings left over from the removed AI features and keeps the rest", async () => {
    localStorage.setItem(
      "openreel-settings",
      JSON.stringify({
        version: 7,
        state: {
          autoSave: false,
          elevenLabsModel: "eleven_v3",
          defaultLlmProvider: "openai-compatible",
          llmBaseUrl: "http://localhost:11434/v1",
          llmModel: "qwen",
          defaultAggregator: "kie-ai",
          mcpAutoAllowTrustedLocal: true,
          configuredServices: ["elevenlabs", "openai-compatible", "kie-ai"],
        },
      }),
    );

    await useSettingsStore.persist.rehydrate();

    const state = useSettingsStore.getState() as unknown as Record<string, unknown>;
    expect(state).toMatchObject({ autoSave: false, elevenLabsModel: "eleven_v3", configuredServices: ["elevenlabs"] });
    for (const key of ["defaultLlmProvider", "llmBaseUrl", "llmModel", "defaultAggregator", "mcpAutoAllowTrustedLocal"]) {
      expect(state[key]).toBeUndefined();
    }
  });
});
