# 삼킴지킴이

Expo SDK 58·React Native·TypeScript 식사 모니터링 앱입니다. 기본 모드는 기기 안에서 음성을 분석하고 기록을 저장합니다. 음성 변화 결과는 흡인 진단이 아닙니다.

## 구현된 흐름

이름·동의 → 장치 권한 → 카메라 확인 → 식사 전 2초 기준 발성 3회 → 모니터링 → 후보/주기적 확인에 따른 2초 발성 → 음성 변화 비교 → 종료·상세 기록·일/주/월 추이.

- PCM은 메모리에서만 수집하고 실제 입력 샘플레이트를 사용합니다. 원본 음성 파일을 만들지 않습니다.
- Mel·MFCC·CPP 특징을 기기에서 추출합니다. 기준 발성 품질·안정성이 부족하면 재녹음하며, 비교 시 녹음 조건 변화도 검사합니다.
- 개인 기준 대비 변화 점수는 재확인·주의·분석 불가를 구분합니다. 검증된 흡인 분류기나 흡인 확률은 아닙니다.
- 식사 기록·보호자 설정은 기기에 보관합니다. 기본 경로는 REST·WebSocket을 사용하지 않습니다.
- Android/iOS 로컬 모듈에 MediaPipe 얼굴 랜드마크와 OpenCV 목 광류 추출 코드를 두었습니다. TCN 학습·내보내기 도구는 `ai-backend/ml`에 있습니다.
- **실제 삼킴 학습 데이터와 배포용 TCN 가중치는 아직 없습니다.** 모델 준비 전에는 자동 감지 불가를 안내하고 수동/주기적 음성 확인을 제공합니다.

## 실행

```sh
npm ci
python scripts/prepare_vision.py
npm run android
```

Mac에서 iPhone:

- 오늘처럼 화면 보면서 고칠 때: `python3 scripts/prepare_vision.py --ios` 후 `npm run ios`(네이티브)와 `npm start`(같은 Wi‑Fi의 Metro). Debug 앱은 맥 서버가 필요합니다.
- 부스처럼 폰만으로 켤 때: `npm run ios:release`. JS·카메라 모듈이 앱 안에 들어가서 노트북이 없어도 됩니다. UX를 고친 뒤에는 이 명령을 다시 실행해야 시연 앱에 반영됩니다.

자동 카메라 파이프라인에는 Expo Go가 아닌 이 개발/릴리스 빌드가 필요합니다.

브라우저 UI는 `npm run web`으로 확인할 수 있습니다. 웹에는 네이티브 MediaPipe/OpenCV 모듈이 없어 자동 카메라 감지를 제공하지 않습니다.

상세 준비·학습·기기 검증 범위는 [docs/on-device.md](docs/on-device.md)를 참고하세요. 네이티브 소스 작성과 JS 테스트 통과만으로 Android/iPhone 실기기 검증이 완료된 것은 아닙니다.

## 검증

```sh
npm run typecheck
npm run lint
npm test
npm run build:web
```

테스트는 DSP, 품질 검사, 세션 상태 전이, 오프라인 전체 UI 흐름, 기록 복원·삭제, Python/TypeScript TCN 계산 일치를 검증합니다. 합성 음성과 장치 모의 입력은 실제 삼킴·흡인 성능 평가가 아닙니다.

연구 서버와 연결하려는 개발 환경에서만 `EXPO_PUBLIC_ANALYSIS_MODE=server`, `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_API_TOKEN`을 지정하세요. 서버 모드는 음성을 전송하므로 온디바이스 모드와 데이터 처리 범위가 다릅니다. 분석 실패 시 서버로 자동 전환하지 않습니다.
