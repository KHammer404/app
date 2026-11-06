import { useAudioStream, setAudioModeAsync, AudioModule, type AudioStreamBuffer } from "expo-audio";
import { useRef } from "react";

type Capture = {
  uri: string;
  bytes: Uint8Array | null;
};

function levelOf(buffer: AudioStreamBuffer) {
  const view = new Int16Array(buffer.data);
  if (!view.length) return 0;
  let sum = 0;
  const step = Math.max(1, Math.floor(view.length / 480));
  let count = 0;
  for (let index = 0; index < view.length; index += step) {
    const sample = view[index] / 32768;
    sum += sample * sample;
    count += 1;
  }
  const rms = Math.sqrt(sum / Math.max(1, count));
  return Math.min(1, Math.pow(rms, 0.55) * 3.4);
}

async function readWav(uri: string) {
  try {
    const { File } = await import("expo-file-system");
    const data = new Uint8Array(await new File(uri).arrayBuffer());
    return data.byteLength > 44 ? data : null;
  } catch {
    return null;
  }
}

export function useWavCapture(onLevel?: (level: number) => void) {
  const onLevelRef = useRef(onLevel);
  onLevelRef.current = onLevel;
  const options = useRef({
    sampleRate: 32000,
    channels: 1 as const,
    encoding: "int16" as const,
    onBuffer(buffer: AudioStreamBuffer) {
      onLevelRef.current?.(levelOf(buffer));
    },
  }).current;
  const { stream } = useAudioStream(options);
  return {
    async begin() {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: "doNotMix",
      });
      await stream.start();
      const started = await stream.startFileRecordingAsync({ format: "wav" });
      return started.uri;
    },
    async end(): Promise<Capture> {
      const stopped = await stream.stopFileRecordingAsync();
      const bytes = await readWav(stopped.uri);
      stream.stop();
      return { uri: stopped.uri, bytes };
    },
    async cancel() {
      try {
        stream.stop();
      } catch {
        // 이미 멈춘 스트림
      }
    },
  };
}

export async function ensureMic() {
  const audio = await AudioModule.requestRecordingPermissionsAsync();
  return audio.granted;
}
