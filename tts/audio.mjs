const FORMAT_INFO = Object.freeze({
  wav: { mime: "audio/wav", gemini: "AUDIO_WAV", extension: "wav" },
  l16: { mime: "audio/l16", gemini: "AUDIO_L16", extension: "pcm" },
  mulaw: { mime: "audio/mulaw", gemini: "AUDIO_MULAW", extension: "mulaw" },
  alaw: { mime: "audio/alaw", gemini: "AUDIO_ALAW", extension: "alaw" },
});

export function formatInfo(format) {
  const info = FORMAT_INFO[format];
  if (!info) throw new Error(`Unsupported audio format: ${format}`);
  return info;
}

export function isWav(buffer) {
  return buffer.length >= 12
    && buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WAVE";
}

export function wrapPcm16MonoAsWav(pcm, sampleRate = 24000) {
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}
