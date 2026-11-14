// The script as the caller wrote it (tags dropped) and WebVTT captions from word times. Unchanged from the API-key factory.
export function cleanSourceText(text) {
  return String(text ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function sourceTranscriptFromRequest(request) {
  const turns = request.turns.map((turn, index) => ({ index, ...(turn.speaker ? { speaker: turn.speaker } : {}), text: cleanSourceText(turn.text) })).filter((turn) => turn.text);
  return { text: turns.map((turn) => turn.text).join(" ").trim(), turns };
}

function vttTime(ms) {
  const s = Math.max(0, Math.round(ms)), h = Math.floor(s / 3_600_000), m = Math.floor((s % 3_600_000) / 60_000), sec = Math.floor((s % 60_000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(s % 1000).padStart(3, "0")}`;
}

export function buildCaptionCues(words, { maxWords = 10, maxDurationMs = 4500 } = {}) {
  const cues = []; let cur = [];
  const flush = () => { if (cur.length) cues.push({ start_ms: cur[0].start_ms, end_ms: cur[cur.length - 1].end_ms, text: cur.map((w) => w.text).join(" ") }); cur = []; };
  for (const w of words) {
    if (cur.length && (cur.length >= maxWords || w.end_ms - cur[0].start_ms > maxDurationMs || w.start_ms - cur[cur.length - 1].end_ms > 900)) flush();
    cur.push(w);
  }
  flush();
  return cues;
}

export function renderVtt(words) {
  const lines = ["WEBVTT", ""];
  buildCaptionCues(words).forEach((c, i) => lines.push(String(i + 1), `${vttTime(c.start_ms)} --> ${vttTime(c.end_ms)}`, c.text, ""));
  return `${lines.join("\n")}\n`;
}
