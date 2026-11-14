// One TTS job, end to end, on Google Cloud without a key: Gemini TTS on Vertex AI speaks the request, Speech-to-Text
// listens back for word times and checks the take against the script, Cloudinary keeps the deliverables under the
// same names the API-key factory used (gemini-tts/<job id>.wav, .transcript.json, .transcript.vtt), so everything
// downstream (the video pipeline's produce.sh) works unchanged.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeRequest } from "./schema.mjs";
import { BALANCED_MODELS, LEGACY_MODELS, MODEL_REGISTRY, QUALITY_MODELS, SPEED_MODELS } from "./models.mjs";
import { accessToken, projectId, synthesize, isRetryableStatus, VertexHttpError } from "./vertex.mjs";
import { listen, STT_MODEL } from "./stt.mjs";
import { agreement, QUALITY_BAR } from "./quality.mjs";
import { renderVtt, sourceTranscriptFromRequest } from "./captions.mjs";
import { uploadAudioToCloudinary, uploadTextArtifactToCloudinary } from "./storage/cloudinary.mjs";

export function safeJobId(value) {
  const clean = String(value || "").trim().replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 120);
  if (!clean) throw new Error("jobId is required");
  return clean;
}

function eligible(modelId, request) {
  const m = MODEL_REGISTRY[modelId];
  if (!m) return false;
  if (request.isMultiSpeaker && !m.supportsMultiSpeaker) return false;
  if (request.voice_requires_38 && m.generation !== "3.8") return false;
  if (request.turns.length > 1 && !request.isMultiSpeaker && m.generation !== "3.8") return false;   // only 3.8 takes several styled turns
  if ((request.format === "mulaw" || request.format === "alaw") && !m.supportsTelephonyFormats) return false;
  return true;
}

export function modelPlan(request) {
  const pref = request.routing === "explicit" ? [request.model, ...(request.allow_model_fallback ? QUALITY_MODELS.filter((m) => m !== request.model) : [])]
    : request.routing === "speed" ? SPEED_MODELS : request.routing === "legacy" ? LEGACY_MODELS : request.routing === "balanced" ? BALANCED_MODELS : QUALITY_MODELS;
  const models = pref.filter((m) => eligible(m, request));
  if (!models.length) throw new Error("No model can satisfy this request");
  return models;
}

// The firmer instruction for a second take, as new-learn does it.
export const RETAKE_STYLE = " Read every word of the transcript exactly as written, in order, without adding, skipping or changing any word.";

export async function runTtsJob({ rawRequest, jobId, env = process.env, outputDir = "out", upload = true, fetcher = fetch, log = () => {} }) {
  const id = safeJobId(jobId), request = normalizeRequest(rawRequest), project = projectId(env);
  const ttsRegion = env.TTS_REGION || "global", sttRegion = env.SPEECH_REGION || "eu";
  const models = modelPlan(request), failures = [];
  const listenBack = request.transcript.enabled, script = sourceTranscriptFromRequest(request);

  // one take: the first model that answers; transient errors move on to the next model after a short wait
  async function take(n) {
    for (const modelId of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const t0 = Date.now();
        try {
          const token = await accessToken(env);
          const got = await synthesize({ modelId, request, project, region: ttsRegion, token, fetcher,
            ...(n > 1 ? { styleSuffix: RETAKE_STYLE, temperature: Math.min(request.temperature, 0.6) } : {}) });
          log(`take ${n}: ${modelId} ${((Date.now() - t0) / 1000).toFixed(0)} s, ${got.audio.length} bytes`);
          return { ...got, latency_ms: Date.now() - t0 };
        } catch (error) {
          failures.push({ take: n, model: modelId, status: error.status ?? null, message: String(error.message).slice(0, 300) });
          if (!(error instanceof VertexHttpError)) throw Object.assign(error, { attempts: failures });
          if (error.status === 404 || error.status === 400) break;                       // this model is not available here: next one
          if (!isRetryableStatus(error.status)) throw Object.assign(new Error(`Vertex generation failed: ${error.message}`), { attempts: failures });
          await new Promise((r) => setTimeout(r, 8000 * (attempt + 1)));
        }
      }
    }
    throw Object.assign(new Error("No Vertex TTS model produced audio"), { attempts: failures });
  }

  async function heard(generated) {
    const token = await accessToken(env);
    const got = await listen({ audio: generated.audio, languageCodes: request.transcript.language_codes, project, region: sttRegion, token, fetcher });
    return { ...got, check: agreement(script.text, got.text) };
  }

  let best = await take(1), bestHeard = null, takes = 1;
  if (listenBack && request.format === "wav") {
    bestHeard = await heard(best);
    log(`take 1 agreement ${bestHeard.check.score.toFixed(3)}`);
    if (bestHeard.check.score < QUALITY_BAR) {
      const second = await take(2), secondHeard = await heard(second); takes = 2;
      log(`take 2 agreement ${secondHeard.check.score.toFixed(3)}`);
      if (secondHeard.check.score > bestHeard.check.score) { best = second; bestHeard = secondHeard; }
    }
  }

  await mkdir(outputDir, { recursive: true });
  const audioPath = path.join(outputDir, `${id}.${best.extension}`);
  await writeFile(audioPath, best.audio);

  let transcriptJson = null, vtt = null, transcriptPath = null, vttPath = null;
  if (bestHeard) {
    const transcript = {
      schema_version: 1, type: "word_timestamps", alignment_mode: "whole_audio_speech_to_text", alignment_provider: "google-speech", alignment_model: STT_MODEL,
      generated_at: new Date().toISOString(), duration_ms: bestHeard.duration_ms, word_count: bestHeard.words.length, diarization: false,
      language_codes: request.transcript.language_codes, recognized_text: bestHeard.text, source_text: script.text, source_turns: script.turns,
      agreement: Number(bestHeard.check.score.toFixed(4)), flagged: bestHeard.check.score < QUALITY_BAR, missing_words: bestHeard.check.missing, words: bestHeard.words,
    };
    transcriptJson = `${JSON.stringify(transcript, null, 2)}\n`;
    transcriptPath = path.join(outputDir, `${id}.transcript.json`); await writeFile(transcriptPath, transcriptJson, "utf8");
    if (request.transcript.write_vtt) { vtt = renderVtt(bestHeard.words); vttPath = path.join(outputDir, `${id}.transcript.vtt`); await writeFile(vttPath, vtt, "utf8"); }
  }

  let cloudinary = null, transcriptCloudinary = null, vttCloudinary = null;
  if (upload) {
    cloudinary = await uploadAudioToCloudinary({ audio: best.audio, format: request.format, mimeType: best.mime_type, jobId: id, model: best.model, env });
    if (transcriptJson) transcriptCloudinary = await uploadTextArtifactToCloudinary({ content: transcriptJson, jobId: id, suffix: "transcript.json", mimeType: "application/json", model: STT_MODEL, env });
    if (vtt) vttCloudinary = await uploadTextArtifactToCloudinary({ content: vtt, jobId: id, suffix: "transcript.vtt", mimeType: "text/vtt", model: STT_MODEL, env });
  }

  return {
    id, status: "completed", created_at: new Date().toISOString(), provider: "vertex-ai", project, model: best.model, routing: request.routing,
    format: request.format, mime_type: best.mime_type, bytes: best.audio.length, takes,
    audio_url: cloudinary?.secure_url || null, transcript_url: transcriptCloudinary?.secure_url || null, vtt_url: vttCloudinary?.secure_url || null,
    quality: bestHeard ? { agreement: Number(bestHeard.check.score.toFixed(4)), bar: QUALITY_BAR, flagged: bestHeard.check.score < QUALITY_BAR, missing_words: bestHeard.check.missing } : null,
    transcript: bestHeard ? { status: "completed", provider: "google-speech", model: STT_MODEL, region: sttRegion, pieces: bestHeard.pieces, word_count: bestHeard.words.length, duration_ms: bestHeard.duration_ms, local_json: transcriptPath, local_vtt: vttPath } : { status: "disabled" },
    cloudinary, transcript_cloudinary: transcriptCloudinary, vtt_cloudinary: vttCloudinary, local_file: audioPath,
    failed_attempts: failures, metadata: request.metadata,
  };
}
