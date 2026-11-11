export const MOTION_VERSION = "landmark-lk6-v1";
export type TemporalLayer = { dilation: number; weights: number[][][]; bias: number[] };
export type TemporalModel = {
  version: string;
  feature_version: string;
  sample_hz: number;
  frames: number;
  threshold: number;
  mean: number[];
  scale: number[];
  layers: TemporalLayer[];
  head: { weights: number[]; bias: number };
  provenance: { trained: boolean; subjects: number; dataset_sha256: string; validation: Record<string, number>; test: Record<string, number> };
};

export function validateModel(value: unknown): TemporalModel {
  const model = value as TemporalModel;
  if (!model || model.feature_version !== MOTION_VERSION || model.sample_hz !== 8 || model.frames !== 16 ||
      !model.version || !Number.isFinite(model.threshold) || model.threshold <= 0 || model.threshold >= 1 ||
      !model.provenance?.trained || model.provenance.subjects < 6 || !/^[0-9a-f]{64}$/.test(model.provenance.dataset_sha256) ||
      !Array.isArray(model.mean) || model.mean.length !== 6 || !model.mean.every(Number.isFinite) ||
      !Array.isArray(model.scale) || model.scale.length !== 6 || !model.scale.every((v) => Number.isFinite(v) && v > 0) ||
      !Array.isArray(model.layers) || model.layers.length !== 2) throw new Error("INVALID_SWALLOW_MODEL");
  let channels = 6;
  for (const layer of model.layers) {
    if (![1, 2].includes(layer.dilation) || !Array.isArray(layer.bias) || !layer.bias.length || layer.bias.length > 64 ||
        !layer.bias.every(Number.isFinite) || layer.weights?.length !== layer.bias.length ||
        !layer.weights.every((row) => row.length === channels && row.every((kernel) => kernel.length === 3 && kernel.every(Number.isFinite)))) throw new Error("INVALID_SWALLOW_MODEL");
    channels = layer.bias.length;
  }
  if (model.head?.weights?.length !== channels || !model.head.weights.every(Number.isFinite) || !Number.isFinite(model.head.bias)) throw new Error("INVALID_SWALLOW_MODEL");
  return model;
}

/** Exact causal cross-correlation and global pooling used by the training model.
 * Small exported weights run on Hermes without a server or inference SDK.
 */
export function probability(model: TemporalModel, frames: number[][]): number {
  if (frames.length !== model.frames || frames.some((frame) => frame.length !== 6 || !frame.every(Number.isFinite))) throw new Error("INVALID_MOTION_WINDOW");
  let sequence = frames.map((frame) => frame.map((value, i) => (value - model.mean[i]) / model.scale[i]));
  for (const layer of model.layers) {
    const input = sequence;
    sequence = input.map((_, time) => layer.weights.map((weights, output) => {
      let sum = layer.bias[output];
      for (let channel = 0; channel < weights.length; channel++) for (let tap = 0; tap < 3; tap++) {
        const at = time - (2 - tap) * layer.dilation;
        if (at >= 0) sum += input[at][channel] * weights[channel][tap];
      }
      return Math.max(0, sum);
    }));
  }
  let score = model.head.bias;
  for (let channel = 0; channel < model.head.weights.length; channel++) {
    score += model.head.weights[channel] * sequence.reduce((sum, frame) => sum + frame[channel], 0) / sequence.length;
  }
  return 1 / (1 + Math.exp(-Math.max(-80, Math.min(80, score))));
}

export class TemporalWatch {
  private history: { at: number; features: number[] }[] = [];
  private cooldown = 0;
  constructor(private model: TemporalModel) { validateModel(model); }
  reset() { this.history = []; this.cooldown = 0; }
  push(features: number[], at: number): number | null {
    if (!Number.isFinite(at) || features.length !== 6 || !features.every(Number.isFinite)) { this.reset(); return null; }
    const previous = this.history.at(-1);
    if (previous && (at <= previous.at || at - previous.at > 400)) this.reset();
    this.history.push({ at, features });
    this.history = this.history.filter((row) => at - row.at <= 2250);
    if (at < this.cooldown || at - this.history[0].at < 1875) return null;
    const window: number[][] = [];
    for (let i = 0; i < 16; i++) {
      const target = at - (15 - i) * 125;
      const closest = this.history.reduce((a, b) => Math.abs(a.at - target) <= Math.abs(b.at - target) ? a : b);
      if (Math.abs(closest.at - target) > 100) return null;
      window.push(closest.features);
    }
    const score = probability(this.model, window);
    if (score < this.model.threshold) return null;
    this.cooldown = at + 2500;
    this.history = [];
    return score;
  }
}
