// Gemini TTS on Vertex AI in the owner's Google Cloud project: no API key anywhere. The access token comes from
// Application Default Credentials, which google-github-actions/auth sets up through Workload Identity Federation
// (docs/SETUP.md); GOOGLE_ACCESS_TOKEN works too, for a one-off run.
import { formatInfo, isWav, wrapPcm16MonoAsWav } from "./audio.mjs";
import { MODEL_REGISTRY } from "./models.mjs";

export class VertexHttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "VertexHttpError";
    this.status = status;
  }
}

let cached = null;
export async function accessToken(env = process.env) {
  if (env.GOOGLE_ACCESS_TOKEN) return env.GOOGLE_ACCESS_TOKEN;
  if (!cached) {
    const { GoogleAuth } = await import("google-auth-library");
    cached = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  }
  const client = await cached.getClient();
  const token = await client.getAccessToken();
  if (!token?.token) throw new Error("No Google Cloud OAuth token from Application Default Credentials");
  return token.token;
}

export function projectId(env = process.env) {
  const project = env.GCP_PROJECT_ID;
  if (typeof project !== "string" || !/^[a-z][a-z0-9-]{4,62}$/.test(project)) throw new Error("Missing/invalid GCP_PROJECT_ID");
  return project;
}

export function endpoint(project, modelId, region = "global") {
  const host = region === "global" ? "aiplatform.googleapis.com" : `aiplatform.${region}.rep.googleapis.com`;
  return `https://${host}/v1/projects/${project}/locations/${region}/publishers/google/models/${encodeURIComponent(modelId)}:generateContent`;
}

const compact = (value) => {
  if (Array.isArray(value)) return value.map(compact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => [k, compact(v)]));
};

// Gemini 3.8: every turn is a part carrying its own delivery (`speechMetadata.style`), the same request the API-key
// factory sent, in Vertex's camelCase. Unary audio comes back as 16-bit 24 kHz mono WAV by default.
export function build38Body(request, { styleSuffix = "" } = {}) {
  const parts = request.turns.map((turn) => ({
    text: turn.text,
    speechMetadata: compact({ speaker: request.isMultiSpeaker ? turn.speaker : undefined, style: turn.style ? turn.style + styleSuffix : styleSuffix.trim() || undefined }),
  }));
  const speechConfig = request.isMultiSpeaker
    ? { multiSpeakerVoiceConfig: { speakerVoiceConfigs: Object.entries(request.speakers).map(([speaker, voice]) => ({ speaker, voiceConfig: { voice } })) } }
    : { voiceConfig: { voice: request.voice } };
  const wav = request.format === "wav";
  return compact({
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      temperature: request.temperature,
      ...(wav ? {} : { responseFormat: [{ audio: { mimeType: formatInfo(request.format).gemini } }] }),
      speechConfig,
    },
  });
}

// Older models (3.1 preview, 2.5): one turn, the style folded into the prompt.
export function buildLegacyBody(request, { styleSuffix = "" } = {}) {
  const turn = request.turns[0];
  const style = (turn.style || "") + styleSuffix;
  return {
    contents: [{ role: "user", parts: [{ text: style.trim() ? `Read the following transcript using this delivery style: ${style.trim()}\n\nTranscript:\n${turn.text}` : turn.text }] }],
    generationConfig: { responseModalities: ["AUDIO"], temperature: request.temperature, speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: request.voice } } } },
  };
}

function audioPart(payload) {
  for (const candidate of payload?.candidates ?? []) for (const part of candidate?.content?.parts ?? []) {
    if (part?.inlineData?.data) return part.inlineData;
    if (part?.inline_data?.data) return part.inline_data;
  }
  return null;
}

export async function synthesize({ modelId, request, project, region = "global", token, styleSuffix = "", temperature, timeoutMs = 10 * 60 * 1000, fetcher = fetch }) {
  const model = MODEL_REGISTRY[modelId];
  if (!model) throw new Error(`Unknown model: ${modelId}`);
  const req = temperature == null ? request : { ...request, temperature };
  const body = model.generation === "3.8" ? build38Body(req, { styleSuffix }) : buildLegacyBody(req, { styleSuffix });
  let response;
  try {
    response = await fetcher(endpoint(project, modelId, region), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") throw new VertexHttpError(408, `Vertex request timed out after ${timeoutMs} ms`);
    throw error;
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new VertexHttpError(response.status, String(payload?.error?.message || `Vertex HTTP ${response.status}`).slice(0, 400));
  const inline = audioPart(payload);
  if (!inline?.data) throw new VertexHttpError(502, "Vertex returned no audio bytes");
  let audio = Buffer.from(inline.data, "base64");
  if (!audio.length) throw new VertexHttpError(502, "Vertex returned an empty audio payload");
  if (request.format === "wav" && !isWav(audio)) audio = wrapPcm16MonoAsWav(audio, 24000);
  return { audio, mime_type: formatInfo(request.format).mime, extension: formatInfo(request.format).extension, model: modelId, usage: payload?.usageMetadata ?? null };
}

export const isRetryableStatus = (status) => status === 408 || status === 429 || status >= 500;
