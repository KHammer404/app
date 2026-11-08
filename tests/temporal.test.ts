import { describe, expect, it } from "vitest";
import fixture from "./temporal-parity.json";
import { probability, TemporalWatch, validateModel, type TemporalModel } from "../src/swallow/temporal";

describe("portable TCN", () => {
  it("matches Python inference on the same exported graph", () => {
    expect(probability(fixture.model, fixture.frames)).toBeCloseTo(fixture.probability, 12);
  });
  it("refuses untrained, incompatible and nonfinite weights", () => {
    expect(() => validateModel(fixture.model)).toThrow("INVALID_SWALLOW_MODEL");
    const model = structuredClone(fixture.model);
    model.provenance.trained = true; model.provenance.subjects = 6;
    expect(validateModel(model).feature_version).toBe("landmark-lk6-v1");
    model.layers[0].weights[0][0][0] = NaN;
    expect(() => validateModel(model)).toThrow("INVALID_SWALLOW_MODEL");
  });
  it("requires a complete, fresh window and enforces cooldown", () => {
    // Deterministic test-only weights; this object is never bundled in the app.
    const model: TemporalModel = structuredClone(fixture.model);
    model.provenance.trained = true; model.provenance.subjects = 6;
    model.head.weights.fill(0); model.head.bias = 10;
    const watch = new TemporalWatch(model);
    for (let i = 0; i < 15; i++) expect(watch.push([0, 0, 0, 0, 0, 0], i * 125)).toBeNull();
    expect(watch.push([0, 0, 0, 0, 0, 0], 1875)).toBeGreaterThan(.99);
    for (let i = 16; i < 35; i++) expect(watch.push([0, 0, 0, 0, 0, 0], i * 125)).toBeNull();
    expect(watch.push([0, 0, 0, 0, 0, 0], 4375)).toBeGreaterThan(.99);
    expect(watch.push([0, 0, 0, 0, 0, 0], 10000)).toBeNull();
    expect(watch.push([0, NaN, 0, 0, 0, 0], 10125)).toBeNull();
  });
});
