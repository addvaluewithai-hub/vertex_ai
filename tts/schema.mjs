import { isKnownModel } from "./models.mjs";
import { voiceRequires38 } from "./voices.mjs";

const FORMATS = new Set(["wav", "l16", "mulaw", "alaw"]);
const ROUTING = new Set(["balanced", "quality", "speed", "legacy", "explicit"]);

function fail(message) {
  const error = new Error(message);
  error.name = "ValidationError";
  throw error;
}

function nonEmptyString(value, field) {
  if (typeof value !== "string" || !value.trim()) fail(`${field} must be a non-empty string`);
  return value.trim();
}

function numberInRange(value, field, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    fail(`${field} must be a number between ${min} and ${max}`);
  }
  return value;
}

function normalizeTurns(input) {
  if (input.text != null && input.turns != null) fail("Use either text or turns, not both");

  if (input.text != null) {
    return [{
      text: nonEmptyString(input.text, "text"),
      style: input.style == null ? undefined : nonEmptyString(input.style, "style"),
      speaker: undefined,
      voice: input.voice == null ? undefined : nonEmptyString(input.voice, "voice"),
    }];
  }

  if (!Array.isArray(input.turns) || input.turns.length === 0) {
    fail("Provide text or at least one item in turns");
  }

  if (input.turns.length > 50) fail("turns supports at most 50 entries");

  return input.turns.map((turn, index) => {
    if (!turn || typeof turn !== "object" || Array.isArray(turn)) fail(`turns[${index}] must be an object`);
    return {
      text: nonEmptyString(turn.text, `turns[${index}].text`),
      style: turn.style == null ? undefined : nonEmptyString(turn.style, `turns[${index}].style`),
      speaker: turn.speaker == null ? undefined : nonEmptyString(turn.speaker, `turns[${index}].speaker`),
      voice: turn.voice == null ? undefined : nonEmptyString(turn.voice, `turns[${index}].voice`),
    };
  });
}

function normalizeTranscript(input, isMultiSpeaker) {
  if (input === false) {
    return {
      enabled: false,
      model: "gemini-3.5-transcribe",
      language_codes: [],
      diarization: false,
      write_vtt: false,
    };
  }

  if (input != null && (typeof input !== "object" || Array.isArray(input))) {
    fail("transcript must be an object or false");
  }

  const block = input ?? {};
  let languageCodes = [];
  if (block.language_codes != null) {
    if (!Array.isArray(block.language_codes)) fail("transcript.language_codes must be an array");
    languageCodes = block.language_codes.map((value, index) =>
      nonEmptyString(value, `transcript.language_codes[${index}]`));
    if (languageCodes.length > 10) fail("transcript.language_codes supports at most 10 language hints");
  }

  return {
    enabled: block.enabled !== false,
    model: "gemini-3.5-transcribe",
    language_codes: languageCodes,
    diarization: block.diarization == null ? isMultiSpeaker : Boolean(block.diarization),
    write_vtt: block.write_vtt !== false,
  };
}

export function normalizeRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("Request body must be a JSON object");

  const turns = normalizeTurns(input);
  const format = input.format == null ? "wav" : String(input.format).toLowerCase();
  if (!FORMATS.has(format)) fail("format must be one of: wav, l16, mulaw, alaw");

  const sampleRate = input.sample_rate == null
    ? (format === "mulaw" || format === "alaw" ? 8000 : 24000)
    : numberInRange(input.sample_rate, "sample_rate", 8000, 48000);

  const temperature = input.temperature == null
    ? 1
    : numberInRange(input.temperature, "temperature", 0, 2);

  const defaultVoice = input.voice == null ? "Kore" : nonEmptyString(input.voice, "voice");

  const speakers = [...new Set(turns.map((t) => t.speaker).filter(Boolean))];
  const isMultiSpeaker = speakers.length > 1 || (turns.length > 1 && speakers.length > 0);

  if (isMultiSpeaker) {
    if (speakers.length !== 2) fail("Multi-speaker requests currently require exactly 2 unique speakers");
    for (const [index, turn] of turns.entries()) {
      if (!turn.speaker) fail(`turns[${index}].speaker is required for every turn in multi-speaker mode`);
    }
  }

  const speakerVoices = {};
  if (input.speakers != null) {
    if (!input.speakers || typeof input.speakers !== "object" || Array.isArray(input.speakers)) {
      fail("speakers must be an object mapping speaker names to voice IDs/names");
    }
    for (const [speaker, voice] of Object.entries(input.speakers)) {
      speakerVoices[nonEmptyString(speaker, "speakers key")] = nonEmptyString(voice, `speakers.${speaker}`);
    }
  }

  for (const turn of turns) {
    if (turn.speaker && turn.voice) speakerVoices[turn.speaker] = turn.voice;
  }

  if (isMultiSpeaker) {
    for (const speaker of speakers) {
      speakerVoices[speaker] ??= defaultVoice;
      if (/^voice(key)?_/i.test(speakerVoices[speaker])) {
        fail("Single-request multi-speaker mode only supports prebuilt voices; custom/replicated voices must be generated turn-by-turn");
      }
    }
  }

  const requestedModel = input.model == null ? undefined : nonEmptyString(input.model, "model");
  if (requestedModel && !isKnownModel(requestedModel)) fail(`Unsupported model: ${requestedModel}`);

  const routing = input.routing == null ? (requestedModel ? "explicit" : "balanced") : String(input.routing);
  if (!ROUTING.has(routing)) fail("routing must be one of: balanced, quality, speed, legacy, explicit");
  if (routing === "explicit" && !requestedModel) fail("routing=explicit requires model");

  return {
    turns,
    voice: defaultVoice,
    speakers: speakerVoices,
    isMultiSpeaker,
    format,
    sample_rate: sampleRate,
    temperature,
    routing,
    model: requestedModel,
    allow_model_fallback: input.allow_model_fallback !== false,
    voice_requires_38: voiceRequires38(defaultVoice)
      || Object.values(speakerVoices).some((voice) => voiceRequires38(voice)),
    transcript: normalizeTranscript(input.transcript, isMultiSpeaker),
    metadata: input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
      ? input.metadata
      : {},
  };
}
