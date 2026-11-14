#!/usr/bin/env node
// The voice factory on Vertex AI (no API key): the same request format as addvaluewithai-hub/gemini-tts (docs/TTS.md).
//   node tts/cli.mjs --file request.json --job-id <id> [--result result.json] [--output-dir out] [--no-upload]
//   node tts/cli.mjs --validate-only --file request.json        checks the request, calls nothing
import { readFile, writeFile } from "node:fs/promises";
import { runTtsJob, modelPlan } from "./worker.mjs";
import { normalizeRequest } from "./schema.mjs";

const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
const has = (name) => process.argv.includes(name);

async function main() {
  const file = arg("--file"), inline = arg("--request");
  if (!file && !inline) throw new Error("Provide --file request.json or --request '<json>'");
  const raw = JSON.parse(file ? await readFile(file, "utf8") : inline);
  if (has("--validate-only")) {
    const r = normalizeRequest(raw);
    console.log(JSON.stringify({ ok: true, turns: r.turns.length, voice: r.voice, models: modelPlan(r), transcript: r.transcript.enabled, characters: r.turns.reduce((a, t) => a + t.text.length, 0) }, null, 2));
    return;
  }
  const jobId = arg("--job-id") || `job-${Date.now()}`, resultPath = arg("--result") || "result.json";
  try {
    const result = await runTtsJob({ rawRequest: raw, jobId, outputDir: arg("--output-dir") || "out", upload: !has("--no-upload"), log: (m) => console.log(m) });
    await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify({ id: result.id, status: result.status, model: result.model, takes: result.takes, quality: result.quality, audio_url: result.audio_url, transcript_url: result.transcript_url }, null, 2));
  } catch (error) {
    await writeFile(resultPath, `${JSON.stringify({ id: jobId, status: "failed", error: error?.message || String(error), attempts: error?.attempts || [] }, null, 2)}\n`).catch(() => {});
    throw error;
  }
}

main().catch((error) => { console.error(`ERROR: ${error?.message || error}`); process.exitCode = 1; });
