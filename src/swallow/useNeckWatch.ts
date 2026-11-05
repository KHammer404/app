import { useEffect, useRef, useState } from "react";
import { decode } from "jpeg-js";

import { downsample, SwallowWatch } from "./detect";

type Shutter = {
  takePicture: (options: {
    quality?: number;
    base64?: boolean;
    shutterSound?: boolean;
    skipProcessing?: boolean;
  }) => Promise<{ uri?: string; base64?: string }>;
};

function bytesFromBase64(value: string) {
  const clean = value.replace(/^data:image\/\w+;base64,/, "");
  const binary = globalThis.atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function discard(uri?: string) {
  if (!uri) return;
  try {
    const { File } = await import("expo-file-system");
    new File(uri).delete();
  } catch {
    // 미리보기 파일 삭제 실패, 분석에는 안 씀
  }
}

export function useNeckWatch(
  cameraRef: { current: Shutter | null },
  enabled: boolean,
  onSwallow: (trigger: "auto" | "periodic", confidence?: number) => void,
  periodicMs = 20000,
) {
  const [hint, setHint] = useState<string | null>(null);
  const watch = useRef(new SwallowWatch());
  const onSwallowRef = useRef(onSwallow);
  useEffect(() => {
    onSwallowRef.current = onSwallow;
  }, [onSwallow]);
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let lostAt = 0;
    let lastPeriodic = 0;
    let busy = false;
    const timer = setInterval(() => {
      if (stopped || busy) return;
      const camera = cameraRef.current;
      if (!camera?.takePicture) {
        setHint("목이 보이지 않아요");
        return;
      }
      busy = true;
      void (async () => {
        try {
          // 프레임 프로세서 없음, 저화질 정지 영상으로 목 움직임만 보고 파일은 지움
          const picture = await camera.takePicture({
            quality: 0.05,
            base64: true,
            shutterSound: false,
            skipProcessing: true,
          });
          void discard(picture.uri);
          if (!picture.base64) {
            setHint("목이 보이지 않아요");
            return;
          }
          const decoded = decode(bytesFromBase64(picture.base64), { useTArray: true, formatAsRGBA: true });
          const gray = downsample(decoded.data, decoded.width, decoded.height, 24, 32);
          const result = watch.current.push(gray, 24, 32, Date.now());
          if (result.kind === "lost") {
            if (!lostAt) lostAt = Date.now();
            setHint("목이 보이지 않아요");
            if (Date.now() - lostAt > 8000 && Date.now() - lastPeriodic > periodicMs) {
              lastPeriodic = Date.now();
              onSwallowRef.current("periodic");
            }
            return;
          }
          lostAt = 0;
          setHint(null);
          if (result.kind === "swallow") onSwallowRef.current("auto", result.confidence);
        } catch {
          setHint("목이 보이지 않아요");
        } finally {
          busy = false;
        }
      })();
    }, 450);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [cameraRef, enabled, periodicMs]);
  return enabled ? hint : null;
}
