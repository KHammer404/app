import { useAudioStream, setAudioModeAsync, AudioModule } from "expo-audio";

type Capture = {
  uri: string;
};

export function useWavCapture() {
  const { stream } = useAudioStream({
    sampleRate: 32000,
    channels: 1,
    encoding: "int16",
  });
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
      stream.stop();
      return { uri: stopped.uri };
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
