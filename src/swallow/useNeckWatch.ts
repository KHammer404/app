import { useEffect, useRef, useState } from "react";
import bundled from "../../assets/models/swallow-tcn.json";
import { nativeVision } from "./native";
import { TemporalWatch, validateModel } from "./temporal";

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
  turn: "얼굴을 화면 가운데로 맞춰 주세요",
};

export function useNeckWatch(
  cameraRef: { current: Shutter | null },
  enabled: boolean,
  onSwallow: (trigger: "auto" | "periodic", confidence?: number) => void,
  periodicMs = 20000,
) {
  const [hint, setHint] = useState<string | null>(null);
  const onSwallowRef = useRef(onSwallow);
  useEffect(() => {
    onSwallowRef.current = onSwallow;
  }, [onSwallow]);
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let lastPeriodic = Date.now();
    let busy = false;
    let watch: TemporalWatch | null = null;
    try {
      if (bundled.model) watch = new TemporalWatch(validateModel(bundled.model));
    } catch { /* Invalid or untrained weights must never produce candidates. */ }
    const classifierNotice = !watch ? "자동 감지는 아직 준비 중이에요. 주기적으로 발성을 확인해요" : null;
    if (nativeVision) void nativeVision.resetAsync().catch(() => {});
    const requestPeriodic = () => {
      if (Date.now() - lastPeriodic >= periodicMs) {
        lastPeriodic = Date.now();
        onSwallowRef.current("periodic");
      }
    };
    const timer = setInterval(() => {
      if (stopped || busy) return;
      if (!nativeVision) {
        setHint("자동 감지에는 전용 앱 빌드가 필요해요. 주기적으로 발성을 확인해요");
        requestPeriodic();
        return;
      }
      // Landmark/flow tracking is useful and testable before the swallow weights
      // exist. It must not emit automatic swallow events without that classifier.
      if (!watch) requestPeriodic();
      const camera = cameraRef.current;
      if (!camera || !canShoot(camera)) {
        setHint(HINT.lost);
        requestPeriodic();
        return;
      }
      busy = true;
      void (async () => {
        try {
          const timestamp = Date.now();
          const picture = await shoot(camera);
          if (!picture) {
            watch?.reset();
            setHint(HINT.lost);
            requestPeriodic();
            return;
          }
          void discard(picture.uri);
          if (!picture.base64) {
            watch?.reset();
            setHint(HINT.lost);
            requestPeriodic();
            return;
          }
          const result = await nativeVision!.analyzeFrameAsync(picture.base64, timestamp);
          if (stopped) return;
          if (result.status === "lost") {
            watch?.reset();
            setHint(HINT.lost);
            requestPeriodic();
            return;
          }
          if (result.status === "turn") {
            watch?.reset();
            setHint(HINT.turn);
            requestPeriodic();
            return;
          }
          if (result.status === "warming") { watch?.reset(); setHint(classifierNotice); return; }
          const confidence = result.features ? watch?.push(result.features, result.timestamp) : null;
          if (confidence != null) {
            lastPeriodic = Date.now();
            setHint(null);
            onSwallowRef.current("auto", confidence);
            return;
          }
          setHint(classifierNotice);
          requestPeriodic();
        } catch {
          if (stopped) return;
          watch?.reset();
          setHint("카메라 분석을 사용할 수 없어 주기적으로 발성을 확인해요");
          requestPeriodic();
        } finally {
          busy = false;
        }
      })();
    }, 125);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [cameraRef, enabled, periodicMs]);
  return enabled ? hint : null;
}
