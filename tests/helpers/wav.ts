// Synthetic microphone input for integration tests, not clinical validation data.
export function sineWav(frequency = 200, amplitude = 0.2, rate = 32000) {
  const count = rate * 2, bytes = new Uint8Array(44 + count * 2), view = new DataView(bytes.buffer);
  const text = (at: number, value: string) => [...value].forEach((character, i) => view.setUint8(at + i, character.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) view.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * frequency * i / rate) * amplitude * 32767), true);
  return bytes;
}
