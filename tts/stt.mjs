// Listening back to the rendered audio with Google Speech-to-Text v2 (Chirp 3) in the same project: what was actually
// said, and when each word starts and ends. Those word times drive captions and lip sync downstream.
// Synchronous recognition takes about a minute of audio per request, so a long take is cut into pieces of at most
// MAX_PIECE seconds at its quietest moments, and the pieces' word times are shifted back into place.
export const STT_MODEL = "chirp_3";
const MAX_PIECE = 55, MIN_PIECE = 35;

/** The PCM samples of a 16-bit mono WAV, with its rate. */
export function readWav(buffer) {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") throw new Error("not a WAV file");
  let p = 12, fmt = null;
  while (p + 8 <= buffer.length) {
    const id = buffer.toString("ascii", p, p + 4); let n = buffer.readUInt32LE(p + 4);
    if (id === "fmt ") fmt = { channels: buffer.readUInt16LE(p + 10), rate: buffer.readUInt32LE(p + 12), bits: buffer.readUInt16LE(p + 22) };
    if (id === "data") {
      if (!fmt || fmt.bits !== 16 || fmt.channels !== 1) throw new Error("expected 16-bit mono PCM");
      if (n === 0 || n === 0xffffffff || p + 8 + n > buffer.length) n = buffer.length - p - 8;          // streamed headers leave the size open
      const data = buffer.subarray(p + 8, p + 8 + n - (n % 2));
      return { rate: fmt.rate, samples: new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.length)) };
    }
    p += 8 + n + (n & 1);
  }
  throw new Error("WAV has no data chunk");
}

export function wavOf(samples, rate) {
  const pcm = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength), h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** Cut points (in samples): each piece between MIN_PIECE and MAX_PIECE seconds, ending at its quietest 200 ms. */
export function cutPoints(samples, rate, { max = MAX_PIECE, min = MIN_PIECE } = {}) {
  const win = Math.round(rate * 0.2), cuts = [0];
  while (samples.length - cuts[cuts.length - 1] > max * rate) {
    const start = cuts[cuts.length - 1], lo = start + min * rate, hi = start + max * rate - win;
    let best = hi, bestE = Infinity;
    for (let s = lo; s <= hi; s += Math.round(win / 4)) {
      let e = 0; for (let i = s; i < s + win; i += 4) e += samples[i] * samples[i];
      if (e < bestE) { bestE = e; best = s; }
    }
    cuts.push(best + Math.round(win / 2));
  }
  cuts.push(samples.length);
  return cuts;
}

const seconds = (value) => (value ? Number(String(value).replace(/s$/, "")) : 0);

async function recognizePiece({ wav, languageCodes, project, region, token, fetcher }) {
  const host = region === "global" ? "speech.googleapis.com" : `${region}-speech.googleapis.com`;
  const response = await fetcher(`https://${host}/v2/projects/${project}/locations/${region}/recognizers/_:recognize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      config: { autoDecodingConfig: {}, languageCodes, model: STT_MODEL, features: { enableWordTimeOffsets: true, enableAutomaticPunctuation: false } },
      content: wav.toString("base64"),
    }),
    signal: AbortSignal.timeout(5 * 60 * 1000),
  });
  if (!response.ok) throw Object.assign(new Error(`Speech-to-Text HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`), { status: response.status });
  const data = await response.json();
  const words = []; let text = "";
  for (const result of data.results ?? []) {
    const alt = result.alternatives?.[0]; if (!alt) continue;
    text += (text ? " " : "") + (alt.transcript ?? "").trim();
    for (const w of alt.words ?? []) words.push({ start: seconds(w.startOffset), end: seconds(w.endOffset), text: String(w.word ?? "").trim() });
  }
  return { text, words };
}

/** Recognise a whole WAV; returns { text, words: [{start_ms, end_ms, text}], pieces }. */
export async function listen({ audio, languageCodes = ["ar-EG"], project, region = "eu", token, fetcher = fetch, retries = 2 }) {
  const { rate, samples } = readWav(audio), cuts = cutPoints(samples, rate);
  const words = [], texts = [];
  for (let k = 0; k + 1 < cuts.length; k++) {
    const piece = wavOf(samples.subarray(cuts[k], cuts[k + 1]), rate), offset = cuts[k] / rate;
    let got = null, last = null;
    for (let attempt = 0; attempt <= retries && !got; attempt++) {
      try { got = await recognizePiece({ wav: piece, languageCodes: languageCodes.length ? languageCodes : ["ar-EG"], project, region, token, fetcher }); }
      catch (error) { last = error; if (error.status && error.status < 500 && error.status !== 429) break; await new Promise((r) => setTimeout(r, 4000 * (attempt + 1))); }
    }
    if (!got) throw last;
    texts.push(got.text);
    for (const w of got.words) if (w.text) {
      const start_ms = Math.round((offset + w.start) * 1000);
      words.push({ start_ms, end_ms: Math.max(start_ms + 1, Math.round((offset + w.end) * 1000)), text: w.text });
    }
  }
  return { text: texts.filter(Boolean).join(" "), words, pieces: cuts.length - 1, duration_ms: Math.round((samples.length / rate) * 1000) };
}
