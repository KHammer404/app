import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Slot, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useApp, VOICE_MS } from "../state/AppState";
import RecordingWaveform from "./RecordingWaveform";
import { Button, Icon, T } from "./UI";
import { RED, s, TEAL } from "./theme";
import GlassTabBar from "./GlassTabBar";
import AnimatedDialog from "./AnimatedDialog";
import MotionPressable from "./MotionPressable";

export default function AppFrame() {
  const app = useApp(),
    path = usePathname();
  const welcome = path === "/",
    monitoring = path === "/monitor";
  const selected =
    path === "/home"
      ? "home"
      : ["/prepare", "/camera", "/monitor"].includes(path)
        ? "prepare"
        : ["/report", "/reports", "/trend"].includes(path)
          ? "reports"
          : "more";
  return (
    <SafeAreaView style={s.outer}>
      <StatusBar style="dark" />
      <View style={s.app}>
        {!welcome && (
          <View style={s.header}>
            <T style={s.brand}>삼킴지킴이</T>
            <MotionPressable
              accessibilityRole="button"
              accessibilityLabel="알림 확인"
              hitSlop={12}
              onPress={() =>
                app.notify(
                  "알림",
                  app.alerts > 0
                    ? "주의 신호가 있어요. 식사 기록을 확인해 주세요."
                    : "새 알림이 없습니다.",
                )
              }
            >
              <Icon name="bell" size={25} />
            </MotionPressable>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Slot />
        </View>
        {app.loaded && !welcome && !monitoring && (
          <GlassTabBar selected={selected} />
        )}
        <SessionModal />
        <InfoModal />
      </View>
    </SafeAreaView>
  );
}
function SessionModal() {
  const app = useApp();
  const voicePrompt =
    app.popup === "voice" || app.popup === "recheck" || app.popup === "unanalyzable";
  const dismiss = () => {
    if (app.recording || app.busy || app.popup === "analyzing" || app.popup === "baseline") return;
    if (app.popup === "caution") return;
    app.setPopup(null);
  };
  return (
    <AnimatedDialog
      visible={!!app.popup}
      onRequestClose={dismiss}
      overlayColor={app.popup === "caution" ? "#E9484999" : "#0009"}
    >
      {app.popup === "baseline" && (
        <>
          <T style={s.modalTitle}>기준 음성 {app.baselineStep}/3</T>
          <T style={[s.caption, s.center]}>
            입안을 비운 뒤 2초 동안 아~ 소리를 내주세요.
          </T>
          {app.learning && (
            <T style={[s.caption, s.center]}>개인 기준으로 비교해요.</T>
          )}
          <RecordingWaveform
            recording={app.recording}
            seconds={app.voiceSeconds}
            durationMs={VOICE_MS}
            levels={app.levels}
          />
          <Button
            title={app.recording ? "녹음 중…" : "2초 발성 녹음 시작"}
            disabled={app.busy || app.recording}
            onPress={() => void app.startVoice()}
          />
        </>
      )}
      {voicePrompt && (
        <>
          <T style={s.modalTitle}>
            {app.popup === "recheck"
              ? "평소와 조금 달라요"
              : app.popup === "unanalyzable"
                ? "소리를 잘 듣지 못했어요"
                : app.promptTrigger === "periodic"
                  ? "목소리를 확인할 시간이에요"
                  : app.promptTrigger === "auto"
                    ? "삼킴 후보가 감지됐어요"
                    : "목소리를 확인해 주세요"}
          </T>
          <T style={[s.caption, s.center]}>
            {app.popup === "recheck"
              ? "같은 자세와 목소리 크기로 2초 동안 아~ 소리를 다시 내주세요"
              : app.popup === "unanalyzable"
                ? app.reasonText || "2초 동안 아~ 소리를 다시 내주세요"
                : "2초동안 “아~” 소리를 내주세요"}
          </T>
          <RecordingWaveform
            recording={app.recording}
            seconds={app.voiceSeconds}
            durationMs={VOICE_MS}
            levels={app.levels}
          />
          <Pressable
            accessibilityRole="button"
            disabled={app.busy}
            onPress={() => void app.redoVoice()}
            style={{ alignSelf: "center", padding: 8 }}
          >
            <T style={[s.link, { textDecorationLine: "underline" }]}>녹음 다시하기</T>
          </Pressable>
          {app.settings.allowSkip && app.popup === "voice" && (
            <Pressable
              accessibilityRole="button"
              disabled={app.busy}
              onPress={() => void app.skipVoice()}
              style={{ alignSelf: "center", padding: 4 }}
            >
              <T style={s.link}>지금은 건너뛰기</T>
            </Pressable>
          )}
        </>
      )}
      {app.popup === "analyzing" && (
        <View style={{ alignItems: "center", paddingVertical: 50, gap: 25 }}>
          <ActivityIndicator size="large" color={TEAL} />
          <T style={[s.bold, { color: TEAL }]}>녹음 처리 중…</T>
        </View>
      )}
      {app.popup === "no_change" && (
        <>
          <View style={s.statusCircle}>
            <Icon name="check" color="white" size={36} />
          </View>
          <T style={[s.modalTitle, { color: TEAL }]}>기준 음성과 큰 차이가 없어요</T>
          <T style={[s.caption, s.center]}>
            이번 녹음에서 큰 음성 변화가 관찰되지 않았어요. 이 결과는 흡인이 없거나 삼킴이 안전하다는 뜻은 아니에요.
          </T>
          <Button compact title="확인" onPress={() => app.setPopup(null)} />
        </>
      )}
      {app.popup === "caution" && (
        <>
          <View style={[s.statusCircle, { backgroundColor: "#FDECEC" }]}>
            <Icon name="alert-triangle" color={RED} size={34} />
          </View>
          <T style={[s.modalTitle, { color: RED }]}>목소리 변화가 반복됐어요</T>
          <T style={[s.modalTitle, { color: RED, fontSize: 20 }]}>
            식사를 잠시 멈추고 상태를 확인해 주세요. 음성 변화만으로 흡인 여부를 알 수는 없어요.
          </T>
          <Button title="상태를 확인했어요" danger onPress={() => void app.resolveCaution()} />
        </>
      )}
    </AnimatedDialog>
  );
}

function InfoModal() {
  const app = useApp(),
    [draft, setDraft] = useState("");
  return (
    <AnimatedDialog
      visible={!!app.info}
      onShow={() => setDraft(app.name)}
      onRequestClose={() => app.setInfo(null)}
    >
      <ScrollView contentContainerStyle={{ gap: 20 }}>
        <T style={s.modalTitle}>{app.info?.title}</T>
        <T style={s.modalBody}>{app.info?.body}</T>
        {app.info?.action === "name" && (
          <>
            <TextInput
              accessibilityLabel="새 이름"
              maxLength={20}
              value={draft}
              onChangeText={setDraft}
              style={s.input}
            />
            <Button
              title="이름 저장하기"
              disabled={!draft.trim() || app.busy}
              onPress={() => void app.saveName(draft)}
            />
          </>
        )}
        {app.info?.action === "delete" && (
          <Button
            title="모든 식사 기록 삭제"
            danger
            onPress={() => void app.deleteRecords()}
          />
        )}
        {app.info?.action === "text" && (
          <>
            <Button
              title="기본 크기"
              secondary={!app.largeText}
              onPress={() => void app.changeTextSize(false)}
            />
            <Button
              title="더 큰 글자"
              secondary={app.largeText}
              onPress={() => void app.changeTextSize(true)}
            />
          </>
        )}
        <Button
          title={app.info?.action ? "취소" : "확인"}
          secondary
          onPress={() => app.setInfo(null)}
        />
      </ScrollView>
    </AnimatedDialog>
  );
}

export function Page({ children }: React.PropsWithChildren) {
  const { loaded } = useApp();
  const path = usePathname();
  const tabbed = path !== "/" && path !== "/monitor";
  return (
    <ScrollView
      contentContainerStyle={[s.content, tabbed && { paddingBottom: 108 }]}
      keyboardShouldPersistTaps="handled"
    >
      {loaded ? (
        children
      ) : (
        <ActivityIndicator color={TEAL} style={{ marginTop: 100 }} />
      )}
    </ScrollView>
  );
}
