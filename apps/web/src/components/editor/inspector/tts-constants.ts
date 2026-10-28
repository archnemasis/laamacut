import type { ElevenLabsModel } from "./tts-types";

export const FALLBACK_MODELS: ElevenLabsModel[] = [
  { model_id: "eleven_v3", name: "Eleven v3", description: "Latest ElevenLabs model", can_do_text_to_speech: true, languages: [] },
];
