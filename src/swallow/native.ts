import { requireOptionalNativeModule } from "expo";

export type TrackingOverlay = { width: number; height: number; landmarks: number[][] };
export type NativeMotion = {
  status: "tracking" | "lost" | "turn" | "warming";
  features?: number[];
  timestamp: number;
  overlay?: TrackingOverlay;
};
type NativeVision = { analyzeFrameAsync(base64: string, timestamp: number): Promise<NativeMotion>; resetAsync(): Promise<void> };
export const nativeVision = requireOptionalNativeModule<NativeVision>("SwallowVision");
