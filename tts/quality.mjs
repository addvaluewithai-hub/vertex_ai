// Did the voice say the script? The words heard on listening back are compared with the script after normalising
// spelling (Arabic letter variants, diacritics, punctuation): the share of script words found, in order. A take below
// QUALITY_BAR is made once more with a firmer instruction and the better take is kept; still below, it is delivered
// with `flagged: true` and the words that were not heard, so a person listens before it is used.
export const QUALITY_BAR = 0.8;

export const norm = (word) => String(word).toLowerCase().normalize("NFKD").replace(/[ً-ٰٟـ]/g, "")
  .replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[^\p{L}\p{N}']/gu, "");

const close = (a, b) => a === b || (a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a)));

/** { score 0..1, missing: [script words not heard, in order] } by a longest-common-subsequence match. */
export function agreement(scriptText, heardText) {
  const raw = String(scriptText).replace(/<[^>]+>/g, " ").split(/\s+/).filter((w) => norm(w)), a = raw.map(norm);
  const b = String(heardText).split(/\s+/).map(norm).filter(Boolean);
  if (!a.length) return { score: 1, missing: [] };
  if (!b.length) return { score: 0, missing: raw.slice(0, 40) };
  const m = a.length, n = b.length, L = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) L[i][j] = close(a[i], b[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const missing = []; let i = 0, j = 0;
  while (i < m && j < n) { if (close(a[i], b[j])) { i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) missing.push(raw[i++]); else j++; }
  while (i < m) missing.push(raw[i++]);
  return { score: L[0][0] / m, missing: missing.slice(0, 40) };
}
