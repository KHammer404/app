# 온디바이스 구현 및 검증

기본 분석 모드는 `device`입니다. `src/analysis/local.ts`가 세션·동의·기록·보고서·추이를 기기에서 처리합니다. `EXPO_PUBLIC_ANALYSIS_MODE=server`는 기존 연구 서버를 확인하기 위한 명시적인 개발 설정이며, 분석 실패 시 서버로 자동 전환하지 않습니다.

## 음성 경로

`expo-audio` PCM 스트림 → 메모리 WAV → 품질 검사 → Mel·MFCC·CPP → 개인 기준 비교 → 결과·보고서.

- 실제 입력 버퍼의 샘플레이트와 채널 수를 사용합니다. 입력 형식이 중간에 바뀌면 분석을 거절합니다.
- 원본 음성 파일을 생성하지 않습니다. 원본 PCM은 최대 3초로 제한하고 분석 후 바이트 버퍼를 비웁니다.
- 식사 전에 2초 발성 3개를 수집합니다. 품질·안정성을 통과하지 않으면 다시 수집하며, 기준 없이 음성 비교를 시작하지 않습니다.
- 무음·작은 소리·클리핑·낮은 SNR·불안정한 발성·기준 대비 큰 녹음 조건 변화를 검사합니다.
- `device-mel128-fft1024-v1`: 32 kHz, 640샘플 Hann 창, 320샘플 hop, 1024 FFT, 128 Mel 밴드, 13 MFCC. CPP는 2048샘플 cepstrum에서 기저 회귀선 대비 피크를 구합니다.
- 기존 Python 서버의 FFT 640 파이프라인과 수치적으로 동일한 특징 버전이 아닙니다. 모델·임계값의 성능을 서로 대체해 주장하면 안 됩니다.
- Mel 평균·표준편차 임베딩의 기준 대비 거리와 EWMA로 음성 변화를 계산합니다. MFCC L2·CPP 변화량은 보조 기록입니다. 기본 sigma·임계값은 연구용 가설값입니다.
- 임베딩·기준 음성 특징은 메모리에만 유지합니다. 영속 저장에는 식사·이벤트·분석 상태·보조 변화량만 남깁니다.
- 재시작 시 진행 중 식사는 마지막 이벤트 시각을 기준으로 중단 처리합니다. 새 식사는 기준 발성을 다시 수집합니다.

## 카메라 경로

Expo 카메라 JPEG → 로컬 `SwallowVision` 모듈 → MediaPipe Face Landmarker → 목 ROI·고개 움직임 추정 → OpenCV `calcOpticalFlowPyrLK` → 6차원 움직임 → TCN → 삼킴 후보.

- Android Kotlin, iOS Swift/Objective-C++ 구현이 `modules/swallow-vision`에 있습니다. 생성된 앱 루트의 `android`·`ios`를 직접 수정하지 않습니다.
- 특징 버전은 `landmark-lk6-v1`입니다. 목 상·중·하 세 구간의 수직 속도에서 고개 이동을 빼고, 목 움직임 크기·입 주변 차이·고개 수직 속도를 추가합니다. 얼굴 폭과 프레임 간 시간으로 정규화합니다.
- 앱과 학습 도구는 320픽셀 폭, 같은 ROI 비율·광류 설정·특징 순서를 사용합니다.
- 추론은 8 Hz, 16프레임 창입니다. 프레임 지연·얼굴 소실·고개 회전 시 이전 창을 폐기합니다.
- 현재 카메라 연결은 주기적인 JPEG 캡처입니다. 휴대폰에서 실제 처리 빈도·발열·배터리를 측정해야 합니다. 목표 빈도를 충족하지 못하면 네이티브 연속 프레임 입력으로 교체해야 합니다.
- TCN은 dilation 1·2의 causal convolution 두 층과 전역 평균 pooling, sigmoid head를 사용합니다. 학습된 JSON 가중치를 Hermes에서 실행하므로 모델 추론 중 네트워크가 필요하지 않습니다.
- **배포용 삼킴 가중치는 아직 없습니다.** `assets/models/swallow-tcn.json`의 `model`은 `null`입니다. 실제 데이터 없이 고정 필터나 임의 가중치를 학습 모델로 표시하지 않습니다.
- 모델 또는 네이티브 모듈이 없으면 자동 감지 불가 상태를 표시하고 수동·주기적 발성 확인을 제공합니다. 이 상태를 자동 삼킴 감지 완료로 간주하면 안 됩니다.

## 네이티브 빌드

Node 24.15 이상과 Python 3가 있는 개발 환경을 권장합니다.

Android:

```sh
npm ci
python scripts/prepare_vision.py
npx expo run:android --device
```

Mac에서 iPhone:

```sh
npm ci
python3 scripts/prepare_vision.py --ios
npx expo run:ios --device
```

준비 스크립트는 공식 Face Landmarker·OpenCV iOS 아카이브를 내려받고 SHA256을 검사합니다. 개발 단계의 공개 모델 다운로드이며 사용자 영상·음성을 읽거나 전송하지 않습니다. 프레임워크 ZIP의 심볼릭 링크도 복원합니다.

EAS를 사용할 경우 개발자 계정에서 프로젝트를 연결한 뒤 실행합니다:

```sh
npx eas-cli@latest build --profile development --platform android
npx eas-cli@latest build --profile development --platform ios
```

`eas-build-pre-install`이 각 빌드 환경에서 공개 모델·iOS 프레임워크를 준비합니다. iOS `pod install`보다 먼저 파일이 있어야 하므로 post-install 훅을 사용하지 않습니다. `eas.json`은 device 모드를 지정합니다. Apple 서명·등록 기기와 EAS 프로젝트 연결은 해당 계정 소유자의 환경에서 설정해야 합니다.

Expo Go에는 커스텀 네이티브 모듈이 없어 자동 카메라 파이프라인을 실행할 수 없습니다. iOS OpenCV 프레임워크의 시뮬레이터 아키텍처 지원은 별도 확인 대상이며 iPhone 실기기를 우선합니다.

## 학습·검증 인계

백엔드 저장소의 `ml/README.md`에 로컬 영상 주석 → 특징 추출 → 피험자 분리 학습 → 앱 가중치 내보내기 절차가 있습니다. 테스트용 합성 입력은 실제 삼킴·흡인 성능 증거가 아닙니다.

현재까지 확인한 범위:

- JS/TS 타입 검사·lint, DSP·상태 전이·UI 통합 테스트.
- 네트워크를 차단한 가입 → 기준 녹음 → 수동 후보 → 음성 비교 → 종료·보고서 흐름.
- Python 학습 그래프와 TypeScript 추론 그래프의 수치 일치.
- Python MediaPipe가 공식 모델을 로드하고 얼굴 없는 입력을 거절하는 smoke check.
- Android 네이티브 모듈 autolinking과 Expo prebuild.
- Android arm64 디버그 APK 네이티브 컴파일 성공, Galaxy S23 Ultra에 `adb install` 성공. APK에 Face Landmarker 모델과 MediaPipe·OpenCV 네이티브 라이브러리 포함 확인.
- 같은 실기기에서 Metro 개발 번들 로드, 초기 설정·홈·준비·카메라 화면 이동, 카메라 미리보기와 카메라/마이크 권한 허용 확인.
- 실제 기준 발성 3회 완료 후 모니터링 진입. 네이티브 프레임 분석에 따른 추적/얼굴·목 미검출 안내 전환 확인. 식사 종료 보고서에 발성 녹음 완료 1회, 건너뜀 1회, 주기적 확인을 제외한 삼킴 0회 저장 확인. 영상이나 음성 원본을 PC로 가져오지 않고 앱 UI 텍스트로 확인했습니다.
- Android arm64 release APK 컴파일·서명 검증·기존 앱 업데이트 설치 성공. Metro 프로세스를 종료하고 `adb reverse`를 해제한 상태에서 강제 종료 후 재실행하여 홈과 기존 식사 기록 표시 확인. release APK에는 Hermes 번들·MediaPipe·OpenCV·Face Landmarker 모델이 포함됩니다. 로컬 테스트 인증서로 서명된 시연용이며 Play Store 배포 서명은 별도입니다. release 버전의 전체 녹음 흐름은 아직 재검증하지 않았습니다.
- iOS 네이티브 모듈 autolinking.
- Android·iOS Hermes 번들과 웹 번들 생성 (`npx expo export --platform all`). 이는 APK/IPA 네이티브 컴파일이 아닙니다.

검증 결과(2026-11-06): 앱 테스트 45개, 타입 검사·lint 통과. 백엔드 기본 환경은 34개 통과·OpenCV 테스트 모듈 1개 skip이며, 별도 Python 3.12 영상 환경에서 OpenCV 테스트 2개가 통과했습니다. 백엔드의 skip은 기본 환경에 영상 학습용 선택 의존성을 설치하지 않았기 때문입니다.

`ai-backend/ml/src/swallow_ml/evaluate.py`에 전체 영상 재생 평가를 추가했습니다. 학습·검증 피험자 혼입을 거절하고 앱의 TCN 시간 창·cooldown을 적용해 삼킴 단위 일대일 매칭, 놓침·오탐·지연·추적 범위를 계산합니다. 추가 테스트 5개는 계산과 평가 흐름을 검증하며 실제 학습 모델 성능을 입증하지 않습니다.

아직 완료하지 않은 검증:

1. Android 장시간 카메라/마이크 사용, 녹음 중 앱 전환·권한 철회·저장 공간 부족 등 실제 기기의 예외 상황 검증.
2. Mac에서 iPhone 네이티브 컴파일·서명·설치.
3. 두 플랫폼의 원본/회전/전면 카메라 방향, ROI·광류 결과 일치, 실제 프레임 처리 빈도.
4. 실제 삼킴 라벨 데이터로 모델 학습·피험자 분리 평가·기기 탑재.
5. 실제 흡인 여부와 대응된 임상 데이터로 음성 변화 기준의 유효성 평가.

현재 Windows PC에는 Android SDK 37.0, Build Tools 37, NDK 27.1.12297006, CMake 3.31.6(Ninja 1.12.1), adb를 설치했습니다. SDK 경로는 `C:\Users\Hammer\tools\android-sdk`이며 사용자 `ANDROID_HOME`과 Android Studio SDK 경로를 맞췄습니다. 기본 Google 다운로드 호스트의 연결 문제는 Google 공식 CDN 경로로 해결했습니다. iOS 컴파일에는 별도로 Mac이 필요합니다. 네이티브 빌드·실기기 검증 결과는 완료 후 아래에 기록합니다.

이 PC에서 Android APK를 다시 빌드하는 명령:

```powershell
.\scripts\build-android.ps1 -UseGoogleCdn
```

네트워크가 정상인 환경에서는 `-UseGoogleCdn`을 생략합니다. 기본값은 arm64 디버그 빌드이며 개발 서버가 필요합니다. `-Variant release`는 독립 실행용 APK, `-Architecture x86_64`는 해당 아키텍처의 에뮬레이터 빌드에 사용합니다. 스토어 배포용 서명 설정과는 별개입니다.

Windows 빌드 스크립트는 `android.cmakeVersion=3.31.6`을 전달합니다. 이 PC의 Gradle 사용자 설정에도 같은 값을 저장했습니다. 기본 CMake 3.22.1의 Ninja 1.10.2는 긴 C++ 경로에서 실패했으며, Windows 긴 경로 지원과 Ninja 1.12 이상이 필요합니다. [Expo 공식 해결 절차](https://docs.expo.dev/troubleshooting/windows-long-paths/)를 따랐으며 생성된 Android 프로젝트나 `node_modules` 소스를 직접 수정하지 않습니다.

학습된 삼킴 가중치가 없어도 네이티브 얼굴·목 추적은 수행하며, 자동 삼킴 이벤트는 생성하지 않습니다. 이때 앱은 자동 감지 준비 중임을 표시하고 주기적 발성 확인을 제공합니다.
