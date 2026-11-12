/** Pure device-side DSP. No networking, file persistence, or native dependencies.
 * Versioned separately from the server's 640-point FFT pipeline: thresholds must
 * be calibrated for this implementation before claiming clinical performance.
 */
export const FEATURE_VERSION = "device-mel128-fft1024-v2";
const RATE = 32000, WINDOW = 640, HOP = 320, FFT = 1024, MELS = 128;
// Engineering input floor, not an aspiration threshold. Periodicity, duration,
// clipping and SNR checks still apply; microphone gain is not voice quality.
const MIN_RMS = 0.003;

export type Features = {
  embedding: number[];
  mfcc: number[];
  cpp: number;
  inputDb: number;
  noiseDb: number;
  voicedSeconds: number;
  reasons: string[];
  warnings: string[];
};

function tag(view: DataView, offset: number) {
  return String.fromCharCode(...Array.from({ length: 4 }, (_, i) => view.getUint8(offset + i)));
}

/** Decode RIFF chunks rather than assuming a 44-byte WAV header. */
export function decodeWav(bytes: Uint8Array): { samples: Float32Array; rate: number } {
  if (bytes.byteLength > 2_000_000) throw new Error("TOO_LARGE");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 44 || tag(view, 0) !== "RIFF" || tag(view, 8) !== "WAVE") throw new Error("DECODE_FAILED");
  const limit = view.getUint32(4, true) + 8;
  if (limit > bytes.length || limit < 12) throw new Error("DECODE_FAILED");
  let channels = 0, rate = 0, format = 0, bits = 0, align = 0;
  let dataAt = -1, dataSize = 0;
  for (let at = 12; at + 8 <= limit;) {
    const size = view.getUint32(at + 4, true), start = at + 8;
    if (size > limit - start) throw new Error("DECODE_FAILED");
    const name = tag(view, at);
    if (name === "fmt ") {
      if (size < 16) throw new Error("DECODE_FAILED");
      format = view.getUint16(start, true);
      channels = view.getUint16(start + 2, true);
      rate = view.getUint32(start + 4, true);
      align = view.getUint16(start + 12, true);
      bits = view.getUint16(start + 14, true);
    } else if (name === "data") {
      dataAt = start;
      dataSize = size;
    }
    at = start + size + (size % 2);
  }
  if (format !== 1 || bits !== 16 || channels < 1 || channels > 2 ||
      rate < 8000 || rate > 96000 || align !== channels * 2 || dataAt < 0 || !dataSize || dataSize % align) {
    throw new Error("DECODE_FAILED");
  }
  const count = dataSize / align;
  if (count / rate > 5) throw new Error("TOO_LONG");
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let value = 0;
    for (let channel = 0; channel < channels; channel++) value += view.getInt16(dataAt + i * align + channel * 2, true) / 32768;
    samples[i] = value / channels;
  }
  return { samples, rate };
}

/** Windowed sinc resampler with a low-pass cutoff for downsampling. */
function resample(input: Float32Array, rate: number) {
  if (rate === RATE) return input;
  const out = new Float32Array(Math.floor(input.length * RATE / rate));
  const cutoff = Math.min(1, RATE / rate), radius = Math.ceil(16 / cutoff);
  for (let i = 0; i < out.length; i++) {
    const position = i * rate / RATE;
    let sum = 0, weights = 0;
    for (let j = Math.max(0, Math.ceil(position - radius)); j <= Math.min(input.length - 1, Math.floor(position + radius)); j++) {
      const d = position - j, x = Math.PI * d * cutoff;
      const w = (Math.abs(x) < 1e-8 ? 1 : Math.sin(x) / x) * (0.5 + 0.5 * Math.cos(Math.PI * d / radius));
      sum += input[j] * w;
      weights += w;
    }
    out[i] = sum / (weights || 1);
  }
  return out;
}

export function transform(re: Float64Array, im: Float64Array, inverse = false) {
  const n = re.length;
  if (n !== im.length || n < 2 || (n & (n - 1))) throw new Error("FFT_SIZE");
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let size = 2; size <= n; size *= 2) {
    const angle = (inverse ? 2 : -2) * Math.PI / size;
    const cr = Math.cos(angle), ci = Math.sin(angle);
    for (let start = 0; start < n; start += size) {
      let wr = 1, wi = 0;
      for (let k = 0; k < size / 2; k++) {
        const a = start + k, b = a + size / 2;
        const tr = wr * re[b] - wi * im[b], ti = wr * im[b] + wi * re[b];
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        [wr, wi] = [wr * cr - wi * ci, wr * ci + wi * cr];
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

function rms(data: Float32Array, start = 0, end = data.length) {
  let sum = 0;
  for (let i = start; i < end; i++) sum += data[i] ** 2;
  return Math.sqrt(sum / Math.max(1, end - start));
}
const db = (value: number) => 20 * Math.log10(value + 1e-8);
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const std = (values: number[]) => { const average = mean(values); return Math.sqrt(mean(values.map((value) => (value - average) ** 2))); };
export const distance = (a: number[], b: number[]) => {
  if (a.length !== b.length || !a.length) throw new Error("FEATURE_MISMATCH");
  return Math.sqrt(a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0));
};

const mel = (hz: number) => 2595 * Math.log10(1 + hz / 700);
const hz = (value: number) => 700 * (10 ** (value / 2595) - 1);
const edges = Array.from({ length: MELS + 2 }, (_, i) => Math.floor((FFT + 1) * hz(mel(RATE / 2) * i / (MELS + 1)) / RATE));

function spectrum(samples: Float32Array) {
  const count = Math.floor((samples.length - WINDOW) / HOP) + 1;
  const logs: number[][] = Array.from({ length: MELS }, () => []);
  const window = Float64Array.from({ length: WINDOW }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / WINDOW));
  const scale = window.reduce((a, b) => a + b, 0);
  for (let frame = 0; frame < count; frame++) {
    const re = new Float64Array(FFT), im = new Float64Array(FFT);
    for (let i = 0; i < WINDOW; i++) {
      const at = frame * HOP + i;
      re[i] = (samples[at] - (at ? 0.97 * samples[at - 1] : 0)) * window[i] / scale;
    }
    transform(re, im);
    for (let band = 0; band < MELS; band++) {
      const left = edges[band], center = Math.max(left + 1, edges[band + 1]);
      const right = Math.max(center + 1, edges[band + 2]);
      let power = 0;
      for (let k = left; k < Math.min(right, FFT / 2 + 1); k++) {
        const weight = k < center ? (k - left) / (center - left) : (right - k) / (right - center);
        power += weight * (re[k] ** 2 + im[k] ** 2);
      }
      logs[band].push(Math.log(power + 1e-10));
    }
  }
  const means = logs.map(mean), deviations = logs.map(std);
  const pooled = [...means, ...deviations], norm = Math.hypot(...pooled) || 1;
  const mfcc = Array.from({ length: 13 }, (_, coefficient) =>
    means.reduce((sum, value, band) => sum + value * Math.cos(Math.PI / MELS * (band + 0.5) * coefficient), 0));
  return { embedding: pooled.map((value) => value / norm), mfcc };
}

/** Cepstral peak prominence relative to a fitted quefrency baseline, in dB. */
function cpp(samples: Float32Array, usable: number) {
  const n = 2048, low = Math.ceil(RATE / 400), high = Math.floor(RATE / 70);
  const values: number[] = [];
  for (let start = 0; start + n <= usable; start += n / 2) {
    const re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = samples[start + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
    transform(re, im);
    for (let i = 0; i < n; i++) { re[i] = 20 * Math.log10(Math.hypot(re[i], im[i]) + 1e-8); im[i] = 0; }
    transform(re, im, true);
    let peak = low, sx = 0, sy = 0, sxx = 0, sxy = 0, count = 0;
    for (let q = Math.ceil(RATE * 0.001); q <= high; q++) {
      sx += q; sy += re[q]; sxx += q * q; sxy += q * re[q]; count++;
      if (q >= low && re[q] > re[peak]) peak = q;
    }
    const slope = (count * sxy - sx * sy) / (count * sxx - sx * sx);
    values.push(re[peak] - (sy - slope * sx) / count - slope * peak);
  }
  return mean(values);
}

function pitchQuality(samples: Float32Array, usable: number) {
  const pitches: number[] = [];
  let count = 0;
  // 8 kHz is sufficient for the 70–400 Hz periodicity quality check.
  for (let start = 0; start + 1280 <= usable; start += 640) {
    const frame = Float64Array.from({ length: 320 }, (_, i) => samples[start + i * 4]);
    const average = frame.reduce((a, b) => a + b, 0) / frame.length;
    for (let i = 0; i < frame.length; i++) frame[i] -= average;
    const energy = frame.reduce((sum, value) => sum + value * value, 0);
    count++;
    if (energy < 1e-6) continue;
    let best = 0, lag = 0;
    for (let shift = 20; shift <= 114; shift++) {
      let correlation = 0;
      for (let i = 0; i + shift < frame.length; i++) correlation += frame[i] * frame[i + shift];
      if (correlation > best) { best = correlation; lag = shift; }
    }
    if (best / energy >= 0.3) pitches.push(8000 / lag);
  }
  return { ratio: pitches.length / Math.max(1, count), cv: pitches.length >= 3 ? std(pitches) / mean(pitches) : Infinity };
}

export function extractFeatures(bytes: Uint8Array, baseline?: Pick<Features, "inputDb" | "noiseDb">): Features {
  const decoded = decodeWav(bytes), input = resample(decoded.samples, decoded.rate);
  const energies: number[] = [];
  for (let start = 0; start + WINDOW <= input.length; start += WINDOW) energies.push(rms(input, start, start + WINDOW));
  const sorted = [...energies].sort((a, b) => a - b);
  const reference = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
  const activityFloor = Math.max(MIN_RMS, reference * 0.15);
  const first = energies.findIndex((value) => value >= activityFloor), onset = Math.max(0, first) * WINDOW;
  const raw = input.subarray(onset, onset + RATE * 2), segment = new Float32Array(RATE * 2);
  segment.set(raw);
  const voicedSeconds = energies.slice(Math.max(0, first), Math.max(0, first) + 100).filter((value) => value >= activityFloor).length * 0.02;
  const level = rms(raw), inputDb = db(level);
  const noise = onset >= WINDOW ? rms(input, 0, onset) : (sorted[Math.floor(sorted.length * 0.2)] ?? 0);
  const noiseDb = db(noise), snr = onset >= WINDOW ? inputDb - noiseDb : 40;
  const clipping = raw.reduce((count, value) => count + (Math.abs(value) >= 0.99 ? 1 : 0), 0) / Math.max(1, raw.length);
  const pitch = pitchQuality(segment, raw.length);
  const reasons: string[] = [], warnings: string[] = [];
  if (voicedSeconds < 0.5) reasons.push("VOICED_TOO_SHORT");
  if (level < MIN_RMS) reasons.push("TOO_QUIET");
  if (clipping > 0.01) reasons.push("CLIPPING");
  if (snr < 6) reasons.push("LOW_SNR");
  if (pitch.ratio < 0.55 || pitch.cv > 0.25) reasons.push("NOT_SUSTAINED_VOWEL");
  if (baseline && Math.abs(inputDb - baseline.inputDb) > 12) warnings.push("LEVEL_SHIFT");
  if (baseline && Math.abs(noiseDb - baseline.noiseDb) > 10) warnings.push("NOISE_FLOOR_SHIFT");
  const features = reasons.length ? { embedding: [], mfcc: [] } : spectrum(segment);
  return { ...features, cpp: reasons.length ? 0 : cpp(segment, raw.length), inputDb, noiseDb, voicedSeconds, reasons, warnings };
}
