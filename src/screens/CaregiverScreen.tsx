import React from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Page } from "../components/AppFrame";
import { Button, Check, T } from "../components/UI";
import { s } from "../components/theme";
import { useApp } from "../state/AppState";
import { CaregiverSettings } from "../settings/caregiver";

const NTH = [
  [1, "매 삼킴"],
  [2, "2회마다"],
  [3, "3회마다"],
] as const;

const PERIODS = [
  [20, "20초"],
  [30, "30초"],
  [45, "45초"],
] as const;

export function CaregiverScreen() {
  const app = useApp();
  const update = (patch: Partial<CaregiverSettings>) => {
    void app.saveSettings({ ...app.settings, ...patch });
  };
  return (
    <Page>
      <T accessibilityRole="header" style={s.title}>
        보호자 설정
      </T>
      <T style={[s.caption, { marginTop: 8 }]}>
        설정은 이 기기에만 저장돼요. 초록 화면은 흡인이 없다는 뜻이 아니에요. 방금 삼켰어요
        버튼은 항상 발성을 요청해요.
      </T>
      <T style={[s.heading, { marginTop: 22 }]}>자동 감지 발성 간격</T>
      <View style={[s.chips, { gap: 7 }]}>
        {NTH.map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: app.settings.everyNth === value }}
            onPress={() => update({ everyNth: value })}
            style={[s.chip, app.settings.everyNth === value && s.selectedChip]}
          >
            <T style={[s.chipText, app.settings.everyNth === value && { color: "white", fontWeight: "700" }]}>
              {label}
            </T>
          </Pressable>
        ))}
      </View>
      <Check
        label="또렷한 목 움직임만 발성 요청"
        checked={app.settings.confidentOnly}
        onPress={() => update({ confidentOnly: !app.settings.confidentOnly })}
      />
      <T style={[s.heading, { marginTop: 18 }]}>목이 안 보일 때</T>
      <View style={[s.chips, { gap: 7 }]}>
        {PERIODS.map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={`주기 ${label}`}
            accessibilityState={{ selected: app.settings.periodicSeconds === value }}
            onPress={() => update({ periodicSeconds: value })}
            style={[s.chip, app.settings.periodicSeconds === value && s.selectedChip]}
          >
            <T
              style={[
                s.chipText,
                app.settings.periodicSeconds === value && { color: "white", fontWeight: "700" },
              ]}
            >
              {label}
            </T>
          </Pressable>
        ))}
      </View>
      <T style={[s.heading, { marginTop: 18 }]}>알림</T>
      <Check
        label="주의 신호 진동"
        checked={app.settings.haptic}
        onPress={() => update({ haptic: !app.settings.haptic })}
      />
      <Check
        label="발성 건너뛰기 허용"
        checked={app.settings.allowSkip}
        onPress={() => update({ allowSkip: !app.settings.allowSkip })}
      />
      <View style={s.spacer} />
      <Button title="더보기로" secondary onPress={() => router.replace("/more")} />
    </Page>
  );
}
