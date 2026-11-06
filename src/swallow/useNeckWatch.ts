import { useEffect, useRef, useState } from "react";
import { decode } from "jpeg-js";

import { downsample, SwallowWatch } from "./detect";

type Shutter = {
  takePicture?: (options: PictureOptions) => Promise<Shot>;
  takePictureAsync?: (options: PictureOptions) => Promise<Shot>;
  getAvailablePictureSizesAsync?: () => Promise<string[]>;
};

type PictureOptions = {
  quality?: number;
  base64?: boolean;
  shutterSound?: boolean;
  skipProcessing?: boolean;
};

type Shot = { uri?: string; base64?: string; width?: number; height?: number };

function canShoot(camera: Shutter) {
  return Boolean(camera.takePictureAsync || camera.takePicture);
}

function shoot(camera: Shutter) {
  const options = { quality: 0.2, base64: true, shutterSound: false, skipProcessing: false };
  if (camera.takePictureAsync) return camera.takePictureAsync(options);
  if (camera.takePicture) return camera.takePicture(options);
  return null;
}

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

const HINT = {
  lost: "얼굴과 목이 보이지 않아요",
  mouth: "씹거나 말하는 동안에는 삼킴으로 세지 않아요",
  turn: "얼굴을 화면 가운데로 맞춰 주세요",
};

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
      if (!camera || !canShoot(camera)) {
        setHint(HINT.lost);
        return;
      }
      busy = true;
      void (async () => {
        try {
          const picture = await shoot(camera);
          if (!picture) {
            setHint(HINT.lost);
            return;
          }
          void discard(picture.uri);
          if (!picture.base64) {
            setHint(HINT.lost);
            return;
          }
          const decoded = decode(bytesFromBase64(picture.base64), { useTArray: true, formatAsRGBA: true });
          if (decoded.width * decoded.height > 2_500_000) {
            setHint(HINT.lost);
            return;
          }
          const gray = downsample(decoded.data, decoded.width, decoded.height, 48, 64);
          const result = watch.current.push(gray, 48, 64, Date.now());
          if (result.kind === "lost") {
            if (!lostAt) lostAt = Date.now();
            setHint(HINT.lost);
            if (Date.now() - lostAt > 8000 && Date.now() - lastPeriodic > periodicMs) {
              lastPeriodic = Date.now();
              onSwallowRef.current("periodic");
            }
            return;
          }
          lostAt = 0;
          if (result.kind === "swallow") {
            setHint(null);
            onSwallowRef.current("auto", result.confidence);
            return;
          }
          setHint(result.note === "watch" ? null : HINT[result.note]);
        } catch {
          setHint(HINT.lost);
        } finally {
          busy = false;
        }
      })();
    }, 120);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [cameraRef, enabled, periodicMs]);
  return enabled ? hint : null;
}
