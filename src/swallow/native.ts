import { requireOptionalNativeModule } from "expo";

export type NativeMotion = { status: "tracking" | "lost" | "turn" | "warming"; features?: number[]; timestamp: number };
type NativeVision = { analyzeFrameAsync(base64: string, timestamp: number): Promise<NativeMotion>; resetAsync(): Promise<void> };
export const nativeVision = requireOptionalNativeModule<NativeVision>("SwallowVision");
