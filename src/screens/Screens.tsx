import React, { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { CameraView } from "expo-camera";
import { Page } from "../components/AppFrame";
import MotionPressable from "../components/MotionPressable";
import AspirationTimeline from "../components/AspirationTimeline";
import { timelineDuration } from "../utils/mealTimeline";
import { Button, Check, Empty, Icon, IconName, T } from "../components/UI";
import { GRAY, RED, s, TEAL } from "../components/theme";
import {
  clock,
  dayLabel,
  duration,
  MealRecord,
  meals,
  useApp,
} from "../state/AppState";

const LANDING_NOTICE = "흡인은 테스트이며 아직 백엔드와 연동이 안돼요";

export function WelcomeScreen() {
  const app = useApp(),
    [draft, setDraft] = useState(""),
    [privacy, setPrivacy] = useState(false),
    [devices, setDevices] = useState(false);
  return (
    <Page>
      <View style={s.welcome}>
        <View>
          <T style={s.welcomeBrand}>삼킴지킴이</T>
          <T style={[s.caption, s.center, { marginTop: 20 }]}>
            {LANDING_NOTICE}
          </T>
        </View>
        <View>
          <T style={s.welcomeQuestion}>삼킴지킴이에서 뭐라고 불러드릴까요?</T>
          <TextInput
            accessibilityLabel="사용자 이름"
            value={draft}
            onChangeText={setDraft}
            maxLength={20}
            placeholder="이름을 입력하세요"
            style={s.input}
          />
        </View>
        <View>
          <View style={s.consents}>
            <Check
              square
              label="개인정보 수집 및 이용 동의"
              checked={privacy}
              onPress={() => setPrivacy(!privacy)}
            />
            <Check
              square
              label="카메라 및 마이크 권한 사용 동의"
              checked={devices}
              onPress={() => setDevices(!devices)}
            />
            <T style={[s.caption, { paddingLeft: 35 }]}>
              이름과 식사 기록은 기기에 저장됩니다.{"\n"}장치 권한은 모니터링
              준비 시 요청해요.
            </T>
          </View>
          <Button
            title="삼킴지킴이 시작하기"
            disabled={!draft.trim() || !privacy || !devices || app.busy}
            onPress={() => void app.saveName(draft)}
          />
        </View>
      </View>
    </Page>
  );
}
export function HomeScreen() {
  const app = useApp(),
    today = app.records.filter(
      (r) => new Date(r.date).toDateString() === new Date().toDateString(),
    );
  return (
    <Page>
      <T accessibilityRole="header" style={s.title}>
        안녕하세요, {app.name} 님
      </T>
      <T style={[s.caption, { marginTop: 12 }]}>{LANDING_NOTICE}</T>
      <View style={s.stats}>
        <T style={s.heading}>오늘의 식사 기록</T>
        <View style={[s.row, { marginTop: 23, gap: 0 }]}>
          {[
            ["기록된 식사", `${today.length}회`],
            ["삼킴 감지", "—"],
            ["흡인 신호", `${today.reduce((n, r) => n + r.alerts, 0)}회`],
          ].map(([label, value], i) => (
            <View key={label} style={[s.stat, i < 2 && s.statDivider]}>
              <T style={s.statLabel}>{label}</T>
              <T
                style={[
                  s.statValue,
                  i === 2 && { color: RED },
                  value === "—" && { fontSize: 19, color: GRAY },
                ]}
              >
                {value}
              </T>
            </View>
          ))}
        </View>
      </View>
      <Button
        title="식사 모니터링 시작하기"
        icon="activity"
        onPress={() => router.replace("/prepare")}
      />
      <View style={[s.between, s.sectionHeader]}>
        <T style={s.heading}>최근 식사 기록</T>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace("/reports")}
        >
          <T style={s.caption}>전체보기 ›</T>
        </Pressable>
      </View>
      {app.records.length ? (
        app.records.slice(0, 3).map((r) => <RecordRow key={r.id} record={r} />)
      ) : (
        <Empty text="첫 식사 모니터링을 시작해 보세요." />
      )}
    </Page>
  );
}
function RecordRow({ record }: { record: MealRecord }) {
  const date = new Date(record.date),
    label = dayLabel(record.date).startsWith("오늘")
      ? "오늘"
      : dayLabel(record.date).startsWith("어제")
        ? "어제"
        : `${date.getMonth() + 1}/${date.getDate()}`;
  return (
    <View style={s.record}>
      <Icon name="coffee" color={TEAL} size={24} />
      <View style={{ flex: 1 }}>
        <T style={s.recordTitle}>
          {record.meal === "간식" ? "간식" : `${record.meal} 식사`}
        </T>
        <T style={s.recordMeta}>
          {label} {clock(date)} · {duration(record.seconds)}
        </T>
      </View>
      <MotionPressable
        accessibilityRole="button"
        accessibilityLabel={`${record.meal} 식사 보고서 확인`}
        onPress={() =>
          router.replace({ pathname: "/report", params: { id: record.id } })
        }
        style={s.recordLink}
      >
        <T style={s.recordLinkText}>통계 확인하기</T>
        <Icon name="chevron-right" color="white" size={17} />
      </MotionPressable>
    </View>
  );
}
export function PrepareScreen() {
  const app = useApp();
  return (
    <Page>
      <T accessibilityRole="header" style={s.title}>
        식사 모니터링 준비
      </T>
      <T style={[s.heading, { marginTop: 24 }]}>식사 유형을 선택하세요</T>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="식사 유형"
        style={s.chips}
      >
        {meals.map((m) => (
          <Pressable
            key={m}
            accessibilityRole="radio"
            accessibilityLabel={m}
            accessibilityState={{ checked: app.meal === m }}
            aria-checked={app.meal === m}
            onPress={() => app.setMeal(m)}
            style={[s.chip, app.meal === m && s.selectedChip]}
          >
            <T
              style={[
                s.chipText,
                app.meal === m && { color: "white", fontWeight: "700" },
              ]}
            >
              {m}
            </T>
          </Pressable>
        ))}
      </View>
      <T style={[s.heading, { marginBottom: 14 }]}>식사 모니터링 준비 상태</T>
      <Permission
        icon="video"
        title="카메라 권한"
        granted={!!app.cameraPermission?.granted}
      />
      <Permission icon="mic" title="마이크 권한" granted={app.mic} />
      <Pressable
        accessibilityRole="button"
        disabled={app.busy}
        onPress={() => void app.permissions()}
        style={s.permissionLink}
      >
        <T style={s.link}>
          {app.busy
            ? "카메라/마이크 연결 중…"
            : "카메라/마이크 권한 설정하러 가기"}
        </T>
      </Pressable>
      <View style={s.spacer} />
      <Button
        title="다음"
        disabled={!app.cameraPermission?.granted || !app.mic || app.busy}
        onPress={() => {
          app.setCameraReady(false);
          app.setChecks([false, false, false]);
          router.replace("/camera");
        }}
      />
    </Page>
  );
}
function Permission({
  icon,
  title,
  granted,
}: {
  icon: IconName;
  title: string;
  granted: boolean;
}) {
  return (
    <View style={s.permissionRow}>
      <Icon name={icon} size={25} />
      <T style={s.permissionText}>{title}</T>
      <T style={[s.permissionStatus, { color: granted ? TEAL : RED }]}>
        {granted ? "허용됨" : "허용되지 않음"}
      </T>
    </View>
  );
}
function Preview() {
  const app = useApp();
  return (
    <View style={s.camera}>
      {app.cameraPermission?.granted && app.active ? (
        <CameraView
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          facing="front"
          onCameraReady={() => app.setCameraReady(true)}
          onMountError={() => {
            app.setCameraReady(false);
            app.notify(
              "카메라 연결 오류",
              "다른 앱이 카메라를 사용 중인지 확인해 주세요. 권한 설정에서 다시 연결할 수 있어요.",
            );
          }}
        />
      ) : (
        <>
          <Icon name="video" color="white" size={35} />
          <T style={s.cameraLabel}>카메라 미리보기</T>
        </>
      )}
    </View>
  );
}
export function CameraScreen() {
  const app = useApp();
  return (
    <Page>
      <T accessibilityRole="header" style={[s.title, { marginBottom: 23 }]}>
        식사 모니터링 준비
      </T>
      <Preview />
      <T style={s.cameraHelp}>
        카메라 위치를 조정해 주세요.{"\n"}얼굴과 목이 화면에 잘 보이도록
        해주세요.
      </T>
      <T style={[s.heading, { marginBottom: 14 }]}>셀프 확인</T>
      {[
        "얼굴이 전부 잘 보여요",
        "목 부위가 전부 잘 보여요",
        "조명이 적절해요",
      ].map((label, i) => (
        <Check
          key={label}
          label={label}
          checked={app.checks[i]}
          onPress={() =>
            app.setChecks(
              app.checks.map((value, j) => (j === i ? !value : value)),
            )
          }
        />
      ))}
      <View style={{ height: 21 }} />
      <Button
        title="식사 모니터링 시작하기"
        disabled={!app.cameraReady || !app.checks.every(Boolean)}
        onPress={app.begin}
      />
    </Page>
  );
}
export function MonitorScreen() {
  const app = useApp();
  return (
    <Page>
      <View style={[s.between, { marginBottom: 25 }]}>
        <T accessibilityRole="header" style={s.title}>
          식사 모니터링 중
        </T>
        <T style={s.timer}>{duration(app.seconds)}</T>
      </View>
      <Preview />
      <T style={s.cameraHelp}>
        식사를 편안하게 이어가세요.{"\n"}발성 안내가 나오면 소리를 내주세요.
      </T>
      <View style={{ gap: 6, paddingHorizontal: 8 }}>
        <T style={s.body}>· 카메라가 작동하고 있어요</T>
        <T style={s.body}>· 발성 확인 시에만 녹음해요</T>
      </View>
      <View style={s.spacer} />
      <Button
        title="식사 모니터링 종료하기"
        disabled={app.busy}
        onPress={() => void app.finish()}
      />
    </Page>
  );
}
export function ReportsScreen() {
  const app = useApp(),
    [filter, setFilter] = useState("전체"),
    filtered = app.records.filter(
      (r) => filter === "전체" || r.meal === filter,
    );
  const groups = new Map<string, MealRecord[]>();
  filtered.forEach((r) => {
    const key = dayLabel(r.date);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  });
  return (
    <Page>
      <T accessibilityRole="header" style={s.title}>
        {app.name} 님의 식사 보고서
      </T>
      <View style={[s.chips, { gap: 7 }]}>
        {["전체", ...meals].map((m) => (
          <Pressable
            key={m}
            accessibilityRole="button"
            accessibilityLabel={`${m} 보고서`}
            accessibilityState={{ selected: filter === m }}
            onPress={() => setFilter(m)}
            style={[
              s.chip,
              { paddingHorizontal: 12 },
              filter === m && s.selectedChip,
            ]}
          >
            <T
              style={[
                s.chipText,
                filter === m && { color: "white", fontWeight: "700" },
              ]}
            >
              {m}
            </T>
          </Pressable>
        ))}
      </View>
      {Array.from(groups).map(([label, items]) => (
        <View key={label} style={{ marginBottom: 26 }}>
          <T style={[s.heading, { marginBottom: 20 }]}>{label}</T>
          {items.map((r) => (
            <RecordRow key={r.id} record={r} />
          ))}
        </View>
      ))}
      {!filtered.length && <Empty />}
    </Page>
  );
}
export function ReportScreen() {
  const app = useApp(),
    { id } = useLocalSearchParams<{ id?: string }>(),
    record = app.records.find((r) => r.id === id);
  if (!record)
    return (
      <Page>
        <T style={s.title}>식사 보고서</T>
        <Empty text="선택한 식사 기록을 찾을 수 없어요." />
        <Button
          title="보고서 목록으로"
          onPress={() => router.replace("/reports")}
        />
      </Page>
    );
  const start = new Date(record.date),
    end = new Date(start.getTime() + timelineDuration(record));
  return (
    <Page>
      <T accessibilityRole="header" style={s.title}>
        {start.getMonth() + 1}월 {start.getDate()}일 {record.meal} 식사 보고서
      </T>
      <View style={s.summary}>
        {[
          [
            "식사 시간",
            `${clock(start)} ~ ${clock(end)} · 총 ${duration(record.seconds)}`,
          ],
          ["삼킴 감지", "—"],
          ["흡인 신호", `${record.alerts}회`],
        ].map(([label, value]) => (
          <View key={label} style={s.summaryRow}>
            <T style={s.summaryLabel}>{label}</T>
            <T style={s.summaryValue}>{value}</T>
          </View>
        ))}
      </View>
      <View style={s.divider} />
      <AspirationTimeline key={record.id} record={record} />
      <T style={s.heading}>발성 기록</T>
      <View style={s.analysisCard}>
        <View style={s.between}>
          <T style={s.body}>발성 녹음 완료</T>
          <T style={[s.bold, { color: TEAL }]}>{record.voices}회</T>
        </View>
      </View>
      <View style={s.spacer} />
      <Button title="홈으로 돌아가기" onPress={() => router.replace("/home")} />
    </Page>
  );
}
export function MoreScreen() {
  const app = useApp();
  return (
    <Page>
      <T accessibilityRole="header" style={s.title}>
        더보기
      </T>
      <View style={s.profile}>
        <Icon name="user" color="white" size={31} />
        <T style={s.profileName}>{app.name}</T>
        <MotionPressable
          accessibilityRole="button"
          onPress={() =>
            app.setInfo({
              title: "내 정보 수정",
              body: "앱에서 사용할 이름을 입력해 주세요.",
              action: "name",
            })
          }
        >
          <T style={s.profileEdit}>내 정보 수정</T>
        </MotionPressable>
      </View>
      <T style={s.groupTitle}>앱 설정</T>
      <Setting
        icon="bell"
        label="알림 설정"
        onPress={() =>
          app.notify(
            "알림 설정",
            "식사 모니터링 중 흡인 알림과 발성 안내를 표시합니다.",
          )
        }
      />
      <Setting
        icon="video"
        label="카메라 및 마이크 권한 관리"
        onPress={() => void app.permissions()}
      />
      <Setting
        icon="type"
        label="화면 및 글자 크기 설정"
        onPress={() =>
          app.setInfo({
            title: "화면 및 글자 크기",
            body: "읽기 편한 글자 크기를 선택해 주세요.",
            action: "text",
          })
        }
      />
      <T style={s.groupTitle}>개인정보 및 보안</T>
      <Setting
        icon="shield"
        label="개인정보 처리 안내"
        onPress={() =>
          app.notify(
            "개인정보 처리 안내",
            "이름과 식사 기록은 이 기기에 저장됩니다. 카메라 영상은 저장하지 않으며, 발성 녹음은 기기에 임시 보관합니다.",
          )
        }
      />
      <Setting
        icon="database"
        label="데이터 저장 및 관리"
        onPress={() =>
          app.setInfo({
            title: "식사 기록 삭제",
            body: "이 기기에 저장된 식사 보고서를 모두 삭제할까요? 삭제하면 복구할 수 없어요. 이름은 유지됩니다.",
            action: "delete",
          })
        }
      />
      <T style={s.groupTitle}>기타</T>
      <Setting
        icon="volume-2"
        label="서비스 이용 안내"
        onPress={() =>
          app.notify(
            "서비스 이용 안내",
            "식사 선택 → 카메라 확인 → 모니터링 시작. 발성 안내가 나오면 “아” 소리를 2초간 내주세요. 종료하면 보고서가 열립니다.",
          )
        }
      />
      <Setting
        icon="help-circle"
        label="문의하기"
        onPress={() =>
          app.notify("문의하기", "문의는 팀 담당자에게 전달해 주세요.")
        }
      />
      <Setting
        icon="info"
        label="앱 버전"
        onPress={() => app.notify("삼킴지킴이 0.2.0", "버전 0.2.0")}
      />
    </Page>
  );
}
function Setting({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <MotionPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      pressScale={0.99}
      style={s.setting}
    >
      <Icon name={icon} color="#444" size={24} />
      <T style={s.settingText}>{label}</T>
    </MotionPressable>
  );
}
