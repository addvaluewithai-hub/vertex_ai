export const STUDIO_VOICES = Object.freeze([
  { id: "Zephyr", character: "Bright" },
  { id: "Puck", character: "Upbeat" },
  { id: "Charon", character: "Informative" },
  { id: "Kore", character: "Firm" },
  { id: "Fenrir", character: "Excitable" },
  { id: "Leda", character: "Youthful" },
  { id: "Orus", character: "Firm" },
  { id: "Aoede", character: "Breezy" },
  { id: "Callirrhoe", character: "Easy-going" },
  { id: "Autonoe", character: "Bright" },
  { id: "Enceladus", character: "Breathy" },
  { id: "Iapetus", character: "Clear" },
  { id: "Umbriel", character: "Easy-going" },
  { id: "Algieba", character: "Smooth" },
  { id: "Despina", character: "Smooth" },
  { id: "Erinome", character: "Clear" },
  { id: "Algenib", character: "Gravelly" },
  { id: "Rasalgethi", character: "Informative" },
  { id: "Laomedeia", character: "Upbeat" },
  { id: "Achernar", character: "Soft" },
  { id: "Alnilam", character: "Firm" },
  { id: "Schedar", character: "Even" },
  { id: "Gacrux", character: "Mature" },
  { id: "Pulcherrima", character: "Forward" },
  { id: "Achird", character: "Friendly" },
  { id: "Zubenelgenubi", character: "Casual" },
  { id: "Vindemiatrix", character: "Gentle" },
  { id: "Sadachbia", character: "Lively" },
  { id: "Sadaltager", character: "Knowledgeable" },
  { id: "Sulafat", character: "Warm" },
]);

const STUDIO_VOICE_SET = new Set(STUDIO_VOICES.map((voice) => voice.id.toLowerCase()));

export function isStudioVoice(voiceId) {
  return typeof voiceId === "string" && STUDIO_VOICE_SET.has(voiceId.trim().toLowerCase());
}

export function voiceRequires38(voiceId) {
  return !isStudioVoice(voiceId);
}

function appendMany(params, name, value) {
  if (value == null) return;
  const values = Array.isArray(value) ? value : [value];
  for (const item of values) {
    const text = String(item).trim();
    if (text) params.append(name, text);
  }
}

function normalizeVoice(raw) {
  return {
    id: raw?.id ?? null,
    display_name: raw?.display_name ?? raw?.displayName ?? null,
    type: raw?.type ?? null,
    language_code: raw?.language_code ?? raw?.languageCode ?? null,
    accent: raw?.accent ?? null,
    region_code: raw?.region_code ?? raw?.regionCode ?? null,
    gender: raw?.gender ?? null,
    pitch: raw?.pitch ?? null,
    persona: raw?.persona ?? null,
    context: raw?.context ?? null,
    description: raw?.description ?? null,
    expire_time: raw?.expire_time ?? raw?.expireTime ?? null,
    model: raw?.model ?? null,
  };
}
