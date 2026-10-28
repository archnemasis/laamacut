import { useState, useCallback, useRef, useEffect } from "react";
import { useSettingsStore } from "../../../../stores/settings-store";
import { isSessionUnlocked, getSecret } from "../../../../services/secure-storage";
import { apiFetch } from "../../../../services/api-proxy";
import type { ElevenLabsVoice, ElevenLabsModel } from "../tts-types";
import { FALLBACK_MODELS } from "../tts-constants";

interface UseElevenLabsApiOptions {
  hasElevenLabsKey: boolean;
  settingsOpen: boolean;
  elevenLabsModel: string;
}

interface UseElevenLabsApiReturn {
  allVoices: ElevenLabsVoice[];
  allModels: ElevenLabsModel[];
  isLoadingVoices: boolean;
  isLoadingModels: boolean;
  generateWithElevenLabs: (text: string, voiceId: string, signal?: AbortSignal) => Promise<Blob>;
}

export function useElevenLabsApi(options: UseElevenLabsApiOptions): UseElevenLabsApiReturn {
  const {
    hasElevenLabsKey,
    settingsOpen,
    elevenLabsModel,
  } = options;

  const isDesktop = typeof window !== "undefined" && window.openreel?.platform === "desktop";

  const {
    cachedElevenLabsVoices,
    cachedElevenLabsModels,
    setCachedElevenLabsVoices,
    setCachedElevenLabsModels,
  } = useSettingsStore();

  const [allVoices, setAllVoices] = useState<ElevenLabsVoice[]>([]);
  const [allModels, setAllModels] = useState<ElevenLabsModel[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const prevSettingsOpen = useRef(settingsOpen);

  const getSignal = useCallback((): AbortSignal => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    return abortControllerRef.current.signal;
  }, []);

  const fetchModels = useCallback(async (signal?: AbortSignal) => {
    if (cachedElevenLabsModels) {
      setAllModels(cachedElevenLabsModels);
      return;
    }

    if (!isSessionUnlocked()) {
      setAllModels(FALLBACK_MODELS);
      return;
    }

    const apiKey = isDesktop ? "" : (await getSecret("elevenlabs")) ?? "";
    if (!isDesktop && !apiKey) {
      setAllModels(FALLBACK_MODELS);
      return;
    }

    setIsLoadingModels(true);
    try {
      const response = await apiFetch("elevenlabs", "/models", apiKey, { signal });

      if (!response.ok) throw new Error("Failed to fetch models");

      const data = await response.json();
      const models = (Array.isArray(data) ? data : []) as ElevenLabsModel[];
      const ttsModels = models.filter((m) => m.can_do_text_to_speech !== false);
      setCachedElevenLabsModels(ttsModels);
      setAllModels(ttsModels);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setAllModels(FALLBACK_MODELS);
    } finally {
      setIsLoadingModels(false);
    }
  }, [cachedElevenLabsModels, setCachedElevenLabsModels, isDesktop]);

  const fetchVoices = useCallback(async (signal?: AbortSignal) => {
    if (cachedElevenLabsVoices) {
      setAllVoices(cachedElevenLabsVoices);
      return;
    }

    if (!isSessionUnlocked()) return;

    const apiKey = isDesktop ? "" : (await getSecret("elevenlabs")) ?? "";
    if (!isDesktop && !apiKey) return;

    setIsLoadingVoices(true);
    try {
      const response = await apiFetch("elevenlabs", "/voices", apiKey, { signal });

      if (!response.ok) throw new Error("Failed to fetch voices");

      const data = await response.json();
      const voices = (data.voices ?? []) as ElevenLabsVoice[];
      setCachedElevenLabsVoices(voices);
      setAllVoices(voices);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    } finally {
      setIsLoadingVoices(false);
    }
  }, [cachedElevenLabsVoices, setCachedElevenLabsVoices, isDesktop]);

  useEffect(() => {
    if (hasElevenLabsKey) {
      const signal = getSignal();
      if (allVoices.length === 0) fetchVoices(signal);
      if (allModels.length === 0) fetchModels(signal);
    }
  }, [hasElevenLabsKey, allVoices.length, allModels.length, fetchVoices, fetchModels, getSignal]);

  useEffect(() => {
    if (prevSettingsOpen.current && !settingsOpen) {
      if (hasElevenLabsKey && isSessionUnlocked()) {
        const signal = getSignal();
        if (allVoices.length === 0) fetchVoices(signal);
        if (allModels.length === 0) fetchModels(signal);
      }
    }
    prevSettingsOpen.current = settingsOpen;
  }, [settingsOpen, hasElevenLabsKey, allVoices.length, allModels.length, fetchVoices, fetchModels, getSignal]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const generateWithElevenLabs = useCallback(async (inputText: string, voiceId: string, signal?: AbortSignal): Promise<Blob> => {
    if (!isSessionUnlocked()) {
      throw new Error("Session locked. Unlock in Settings > API Keys first.");
    }

    const apiKey = isDesktop ? "" : (await getSecret("elevenlabs")) ?? "";
    if (!isDesktop && !apiKey) {
      throw new Error("ElevenLabs API key not found. Add it in Settings > API Keys.");
    }

    const response = await apiFetch(
      "elevenlabs",
      `/text-to-speech/${voiceId}`,
      apiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: inputText,
          model_id: elevenLabsModel,
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
        signal,
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const msg = (errorData as Record<string, unknown>).detail
        ?? (errorData as Record<string, unknown>).message
        ?? `ElevenLabs error (${response.status})`;
      throw new Error(String(msg));
    }

    return response.blob();
  }, [elevenLabsModel, isDesktop]);

  return {
    allVoices,
    allModels,
    isLoadingVoices,
    isLoadingModels,
    generateWithElevenLabs,
  };
}
