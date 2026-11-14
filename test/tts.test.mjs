import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build38Body, endpoint } from "../tts/vertex.mjs";
import { cutPoints, wavOf, readWav } from "../tts/stt.mjs";
import { agreement } from "../tts/quality.mjs";
import { normalizeRequest } from "../tts/schema.mjs";
import { runTtsJob, modelPlan, RETAKE_STYLE } from "../tts/worker.mjs";

const episode = { turns: [{ style: "Brisk, dry.", text: "يا فندم، تقرير ميداني جديد. <short pause> موضوع النهارده: البيتكوين." }, { style: "Calm.", text: "الفلوس اتفاق جماعي." }],
  voice: "Puck", routing: "quality", format: "wav", sample_rate: 24000, temperature: 1, transcript: { language_codes: ["ar-EG"], write_vtt: true } };

test("3.8 body: one part per turn with its style, the voice by name, WAV by default", () => {
  const b = build38Body(normalizeRequest(episode));
  assert.equal(b.contents[0].parts.length, 2);
  assert.equal(b.contents[0].parts[0].speechMetadata.style, "Brisk, dry.");
  assert.equal(b.generationConfig.speechConfig.voiceConfig.voice, "Puck");
  assert.deepEqual(b.generationConfig.responseModalities, ["AUDIO"]);
  assert.equal(b.generationConfig.responseFormat, undefined);
  assert.match(endpoint("my-project-1", "gemini-3.8-flash-tts"), /^https:\/\/aiplatform\.googleapis\.com\/v1\/projects\/my-project-1\/locations\/global\/publishers\/google\/models\/gemini-3\.8-flash-tts:generateContent$/);
});

test("a styled multi-turn request only goes to 3.8 models", () => {
  assert.ok(modelPlan(normalizeRequest(episode)).every((m) => m.startsWith("gemini-3.8")));
});

test("long audio is cut into pieces of 35..55 s at quiet moments", () => {
  const rate = 1000, s = new Int16Array(rate * 130).map((_, i) => (Math.floor(i / rate) % 10 === 9 ? 0 : 8000));
  const cuts = cutPoints(s, rate);
  assert.equal(cuts[0], 0); assert.equal(cuts.at(-1), s.length);
  for (let k = 1; k < cuts.length; k++) assert.ok(cuts[k] - cuts[k - 1] <= 55 * rate);
  for (const c of cuts.slice(1, -1)) assert.equal(s[c], 0);                                   // in a silence
  const back = readWav(wavOf(s.subarray(0, 500), rate)); assert.equal(back.rate, rate); assert.equal(back.samples.length, 500);
});

test("agreement: spelling variants count, a skipped phrase does not", () => {
  assert.equal(agreement("الفلوس اتفاق جماعي.", "الفلوس اتفاق جماعى").score, 1);
  const r = agreement("واحد اتنين تلاتة اربعة", "واحد اربعة");
  assert.equal(r.score, 0.5); assert.deepEqual(r.missing, ["اتنين", "تلاتة"]);
});

function fakeGoogle({ heard }) {
  const calls = [];
  const wav = wavOf(new Int16Array(24000 * 3).fill(1000), 24000);
  const fetcher = async (url, init) => {
    const body = JSON.parse(init.body); calls.push({ url, body });
    assert.equal(init.headers.Authorization, "Bearer test-token");
    if (url.includes("aiplatform")) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/wav", data: wav.toString("base64") } }] } }] }), { status: 200 });
    const text = heard.shift();
    return new Response(JSON.stringify({ results: [{ alternatives: [{ transcript: text, words: text.split(" ").map((w, i) => ({ word: w, startOffset: `${i * 0.4}s`, endOffset: `${i * 0.4 + 0.3}s` })) }] }] }), { status: 200 });
  };
  return { fetcher, calls };
}

test("a good take is delivered with word times and no retake", async () => {
  const g = fakeGoogle({ heard: ["يا فندم تقرير ميداني جديد موضوع النهارده البيتكوين الفلوس اتفاق جماعي"] });
  const out = await mkdtemp(join(tmpdir(), "tts-"));
  const r = await runTtsJob({ rawRequest: episode, jobId: "t1", env: { GCP_PROJECT_ID: "my-project-1", GOOGLE_ACCESS_TOKEN: "test-token" }, outputDir: out, upload: false, fetcher: g.fetcher });
  assert.equal(r.takes, 1); assert.equal(r.quality.flagged, false); assert.equal(r.quality.agreement, 1);
  const t = JSON.parse(await readFile(r.transcript.local_json, "utf8"));
  assert.equal(t.words[1].text, "فندم"); assert.equal(t.words[1].start_ms, 400);
  assert.ok(g.calls[1].url.startsWith("https://eu-speech.googleapis.com/v2/projects/my-project-1/locations/eu/recognizers/_:recognize"));
});

test("a take that skips words is made again with the firmer instruction, and the better one kept", async () => {
  const g = fakeGoogle({ heard: ["يا فندم", "يا فندم تقرير ميداني جديد موضوع النهارده البيتكوين الفلوس اتفاق جماعي"] });
  const out = await mkdtemp(join(tmpdir(), "tts-"));
  const r = await runTtsJob({ rawRequest: episode, jobId: "t2", env: { GCP_PROJECT_ID: "my-project-1", GOOGLE_ACCESS_TOKEN: "test-token" }, outputDir: out, upload: false, fetcher: g.fetcher });
  assert.equal(r.takes, 2); assert.equal(r.quality.agreement, 1);
  const second = g.calls.filter((c) => c.url.includes("aiplatform"))[1].body;
  assert.ok(second.contents[0].parts[0].speechMetadata.style.endsWith(RETAKE_STYLE));
  assert.equal(second.generationConfig.temperature, 0.6);
});
