import { requireOptionalNativeModule } from "expo";
type NativeRemote = {
  startAsync(): Promise<void>;
  stopAsync(): Promise<void>;
  setReadyAsync(ready: boolean): Promise<void>;
  completeAsync(id: string, accepted: boolean): Promise<void>;
  addListener(event: "onRemoteSwallow", listener: (event: { id: string }) => void): { remove(): void };
};
export const nativeRemote = requireOptionalNativeModule<NativeRemote>("SwallowRemote");
