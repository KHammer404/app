import { useAudioStream, setAudioModeAsync, AudioModule, type AudioStreamBuffer } from "expo-audio";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { encodePcmWav } from "./wav";

type Capture = { uri: string; bytes: Uint8Array | null };

function levelOf(buffer: AudioStreamBuffer) {
  const view = new DataView(buffer.data);
  let sum = 0, count = 0;
  const step = Math.max(1, Math.floor(view.byteLength / 2 / 480));
  for (let index = 0; index + 1 < view.byteLength; index += step * 2) {
    const sample = view.getInt16(index, true) / 32768;
    sum += sample * sample; count++;
  }
  return Math.min(1, Math.pow(Math.sqrt(sum / Math.max(1, count)), 0.55) * 3.4);
}

/** PCM stays in bounded memory. No cache file, Blob URL, fetch or filesystem API. */
export function useWavCapture(onLevel?: (level: number) => void) {
  const onLevelRef = useRef(onLevel);
  const active = useRef(false), chunks = useRef<Uint8Array[]>([]), size = useRef(0);
  const format = useRef<{ rate: number; channels: number } | null>(null);
  const failure = useRef<string | null>(null);
  useEffect(() => { onLevelRef.current = onLevel; }, [onLevel]);
  const options = useMemo(() => ({
    sampleRate: 32000,
    channels: 1 as const,
    encoding: "int16" as const,
    onBuffer(buffer: AudioStreamBuffer) {
      if (!active.current) return;
      const { sampleRate: rate, channels } = buffer;
      if (!Number.isInteger(rate) || rate < 8000 || rate > 96000 || ![1, 2].includes(channels) || buffer.data.byteLength % (2 * channels)) {
        failure.current = "INVALID_AUDIO_FORMAT";
        return;
      }
      const previous = format.current;
      if (previous && (previous.rate !== rate || previous.channels !== channels)) {
        failure.current = "AUDIO_FORMAT_CHANGED";
        return;
      }
      format.current = { rate, channels };
      const remaining = Math.max(0, rate * channels * 2 * 3 - size.current);
      const length = Math.min(remaining, buffer.data.byteLength);
      if (length) {
        chunks.current.push(new Uint8Array(buffer.data, 0, length).slice());
        size.current += length;
      }
      onLevelRef.current?.(levelOf(buffer));
    },
  }), []);
  const { stream } = useAudioStream(options);
  const clear = useCallback(() => {
    chunks.current.forEach((chunk) => chunk.fill(0));
    chunks.current = []; size.current = 0; format.current = null; failure.current = null;
  }, []);
  useEffect(() => () => {
    active.current = false;
    stream.stop();
    clear();
  }, [stream, clear]);
  return useMemo(() => ({
    async begin() {
      if (active.current) throw new Error("RECORDING_ACTIVE");
      clear();
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, interruptionMode: "doNotMix" });
      active.current = true;
      try {
        await stream.start();
        return "memory://voice.wav";
      } catch (error) {
        active.current = false; stream.stop(); clear(); throw error;
      }
    },
    async end(): Promise<Capture> {
      active.current = false;
      stream.stop();
      try {
        if (failure.current) throw new Error(failure.current);
        if (!format.current || !size.current) throw new Error("NO_AUDIO_CAPTURED");
        const bytes = encodePcmWav(chunks.current, format.current.rate, format.current.channels);
        return { uri: "memory://voice.wav", bytes };
      } finally { clear(); }
    },
    async cancel() { active.current = false; stream.stop(); clear(); },
  }), [stream, clear]);
}

export async function ensureMic() {
  return (await AudioModule.requestRecordingPermissionsAsync()).granted;
}
