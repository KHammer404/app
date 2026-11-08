/** Encode interleaved little-endian PCM16 buffers using the actual capture rate. */
export function encodePcmWav(chunks: Uint8Array[], rate: number, channels: number) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  if (!Number.isInteger(rate) || rate < 8000 || rate > 96000 || ![1, 2].includes(channels) ||
      !length || length % (2 * channels) || length > rate * channels * 2 * 5) throw new Error("INVALID_AUDIO_FORMAT");
  const bytes = new Uint8Array(44 + length), view = new DataView(bytes.buffer);
  const text = (at: number, value: string) => [...value].forEach((character, i) => view.setUint8(at + i, character.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, 36 + length, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * channels * 2, true);
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, length, true);
  let offset = 44;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
