export const MODEL_REGISTRY = Object.freeze({
  "gemini-3.8-flash-tts": {
    id: "gemini-3.8-flash-tts",
    generation: "3.8",
    quality: "highest",
    supportsStructuredMetadata: true,
    supportsMultiSpeaker: true,
    supportsTelephonyFormats: true,
  },
  "gemini-3.8-flash-lite-tts": {
    id: "gemini-3.8-flash-lite-tts",
    generation: "3.8",
    quality: "efficient",
    supportsStructuredMetadata: true,
    supportsMultiSpeaker: true,
    supportsTelephonyFormats: true,
  },
  "gemini-3.1-flash-tts-preview": {
    id: "gemini-3.1-flash-tts-preview",
    generation: "legacy",
    quality: "legacy",
    supportsStructuredMetadata: false,
    supportsMultiSpeaker: false,
    supportsTelephonyFormats: false,
  },
  "gemini-2.5-flash-preview-tts": {
    id: "gemini-2.5-flash-preview-tts",
    generation: "legacy",
    quality: "legacy",
    supportsStructuredMetadata: false,
    supportsMultiSpeaker: false,
    supportsTelephonyFormats: false,
  },
});

export const BALANCED_MODELS = Object.freeze([
  "gemini-3.8-flash-lite-tts",
  "gemini-3.8-flash-tts",
  "gemini-3.1-flash-tts-preview",
  "gemini-2.5-flash-preview-tts",
]);

export const QUALITY_MODELS = Object.freeze([
  "gemini-3.8-flash-tts",
  "gemini-3.8-flash-lite-tts",
  "gemini-3.1-flash-tts-preview",
  "gemini-2.5-flash-preview-tts",
]);

export const SPEED_MODELS = Object.freeze([
  "gemini-3.8-flash-lite-tts",
  "gemini-3.8-flash-tts",
  "gemini-3.1-flash-tts-preview",
  "gemini-2.5-flash-preview-tts",
]);

export const LEGACY_MODELS = Object.freeze([
  "gemini-3.1-flash-tts-preview",
  "gemini-2.5-flash-preview-tts",
]);

export function isKnownModel(modelId) {
  return Boolean(MODEL_REGISTRY[modelId]);
}
