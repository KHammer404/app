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
        : ["/report", "/reports"].includes(path)
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
                    ? "흡인 알림이 1건 있습니다."
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
  const close = () => {
    if (app.recording || app.busy || app.popup === "processing") return;
    app.setPopup(app.popup === "alert" ? "voice" : null);
  };
  return (
    <AnimatedDialog
      visible={!!app.popup}
      onRequestClose={close}
      overlayColor={app.popup === "alert" ? "#E9484999" : "#0009"}
    >
      {app.popup === "alert" && (
        <>
          <View style={[s.statusCircle, { backgroundColor: RED }]}>
            <Icon name="alert-triangle" color="white" size={38} />
          </View>
          <T style={[s.modalTitle, { color: RED }]}>흡인 알림</T>
          <Button
            title="발성 안내"
            danger
            onPress={() => app.setPopup("voice")}
          />
        </>
      )}
      {app.popup === "voice" && (
        <>
          <T style={s.modalTitle}>2초 동안 “아~” 소리를 내주세요</T>
          <T style={[s.caption, s.center]}>
            녹음 버튼을 누른 뒤 편안하게 소리를 내주세요.
          </T>
          <RecordingWaveform
            recording={app.recording}
            seconds={app.voiceSeconds}
            durationMs={VOICE_MS}
          />
          <Button
            title={
              app.recording
                ? "녹음 중…"
                : app.busy
                  ? "마이크 준비 중…"
                  : "2초 발성 녹음 시작"
            }
            disabled={app.busy || app.recording}
            onPress={() => void app.startVoice()}
          />
          <Pressable
            accessibilityRole="button"
            disabled={app.recording || app.busy}
            onPress={() => app.setPopup(null)}
            style={{ alignSelf: "center", padding: 8 }}
          >
            <T style={s.link}>지금은 건너뛰기</T>
          </Pressable>
        </>
      )}
      {app.popup === "processing" && (
        <View style={{ alignItems: "center", paddingVertical: 50, gap: 25 }}>
          <ActivityIndicator size="large" color={TEAL} />
          <T style={[s.bold, { color: TEAL }]}>녹음 처리 중…</T>
        </View>
      )}
      {app.popup === "done" && (
        <>
          <View style={s.statusCircle}>
            <Icon name="check" color="white" size={45} />
          </View>
          <T style={[s.modalTitle, { color: TEAL }]}>녹음 완료</T>
          <Button title="확인" onPress={() => app.setPopup(null)} />
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
  return (
    <ScrollView
      contentContainerStyle={s.content}
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
