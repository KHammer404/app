import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { MealRecord } from "../state/AppState";
import { recordingReasonText } from "../api/client";
import { elapsedLabel, timelineClock, timelineDuration } from "../utils/mealTimeline";
import { VOICE_STATE } from "../utils/voiceReport";
import { T } from "./UI";
import { INK, RED, TEAL } from "./theme";

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const value = (n: unknown, signed = false) => finite(n) ? `${signed && n > 0 ? "+" : ""}${n.toFixed(2)}` : "미기록";
export default function VoiceAnalysisReport({ record }: { record: MealRecord }) {
  const rows = record.voiceMeasurements ?? [];
  const scored = rows.filter((row) => finite(row.score));
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState(scored[0]?.id);
  const start = Date.parse(record.date), total = Math.max(1, timelineDuration(record));
  const peak = scored.length ? Math.max(...scored.map((row) => row.score!)) : null;
  const lastAcoustic = rows.filter((row) => row.acoustic).at(-1)?.acoustic;
  const ceiling = Math.max(4, Math.ceil((peak ?? 0) * 1.15));
  const plotHeight = 150;
  const y = (score: number) => plotHeight - score / ceiling * plotHeight;
  const points = rows.map((row) => {
    const at = row.recordedAt ? Date.parse(row.recordedAt) : NaN;
    return finite(row.score) && Number.isFinite(at) && at >= start && at <= start + total
      ? { row, x: Math.max(0, Math.min(width, (at - start) / total * width)), y: y(row.score) } : null;
  });
  return <View style={styles.section}>
    <T accessibilityRole="header" style={styles.heading}>음성 분석 수치</T>
    {scored.length ? <>
      <View style={styles.metrics}>
        {[["분석 완료", `${record.voices}회`], ["최대 변화 점수", value(peak)],
          ["최근 MFCC 거리", value(lastAcoustic?.mfcc_l2)], ["최근 CPP 변화량", value(lastAcoustic?.cpp_delta, true)]].map(([label, number]) =>
          <View key={label} style={styles.metric}><T style={styles.label}>{label}</T><T style={styles.number}>{number}</T></View>)}
      </View>
      <T style={styles.caption}>개인 기준 대비 변화 점수입니다. 점수가 클수록 기준 발성과 차이가 큽니다.</T>
      <View accessibilityRole="image" accessibilityLabel={`음성 변화 점수 그래프, ${scored.length}개 측정, 최대 ${value(peak)}`} style={styles.chart}>
        <View style={styles.plot} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
          {[0, 3, ceiling].map((tick) => <React.Fragment key={tick}>
            <T style={[styles.tick, { top: y(tick) - 8 }]}>{tick}</T>
            <View style={{ position: "absolute", left: 0, right: 0, top: y(tick), height: 1,
              backgroundColor: tick === 3 ? "#C27A3E" : "#E3E8EB" }} />
          </React.Fragment>)}
          {points.map((point, i) => {
            const prev = points[i - 1];
            if (!point) return null;
            const length = prev ? Math.hypot(point.x - prev.x, point.y - prev.y) : 0;
            return <React.Fragment key={point.row.id}>
              {prev && length > 0 && <View style={{ position: "absolute", left: (prev.x + point.x - length) / 2,
                top: (prev.y + point.y) / 2, width: length, height: 2, backgroundColor: TEAL,
                transform: [{ rotate: `${Math.atan2(point.y - prev.y, point.x - prev.x)}rad` }] }} />}
              <Pressable accessibilityRole="button" accessibilityLabel={`음성 측정 ${i + 1}, 변화 점수 ${value(point.row.score)}`}
                onPress={() => setSelected(point.row.id)}
                style={{ position: "absolute", left: point.x - 22, top: point.y - 22, width: 44, height: 44,
                  alignItems: "center", justifyContent: "center" }}>
                <View style={{ width: selected === point.row.id ? 12 : 8, height: selected === point.row.id ? 12 : 8,
                  borderRadius: 6, backgroundColor: point.row.state === "caution" ? RED : TEAL, borderColor: "white", borderWidth: 1 }} />
              </Pressable>
            </React.Fragment>;
          })}
          <T style={[styles.axis, { left: 0 }]}>00:00</T>
          <T style={[styles.axis, { right: 0 }]}>{elapsedLabel(total)}</T>
        </View>
      </View>
      <T style={styles.caption}>가로축: 식사 경과 시간 · 세로축: 변화 점수{ "\n" }갈색 선(3): 즉시 재확인 기준. 흡인 위험 확률이 아닙니다.</T>
    </> : <View style={styles.empty}>
      <T style={styles.emptyTitle}>{record.voices > 0 ? "이전 기록에 변화 점수가 저장되지 않았어요" : "분석 완료한 발성이 없어 그래프를 표시할 수 없어요"}</T>
      <T style={styles.caption}>{record.voices > 0
        ? "저장된 수치만 표시하며, 없는 값을 추정해 채우지 않아요."
        : "식사 전 기준 발성 3회는 준비 단계입니다. 모니터링 중 발성 안내에서 녹음과 분석을 완료해야 수치가 남아요."}</T>
    </View>}
    {rows.map((row, i) => <View key={row.id} style={[styles.row, selected === row.id && styles.selected]}>
      <View style={styles.between}>
        <T style={styles.rowTitle}>{i + 1}. {VOICE_STATE[row.state] ?? "상태 미기록"}</T>
        <T style={styles.label}>{row.recordedAt ? "녹음 " : "요청 "}{timelineClock(new Date(row.recordedAt ?? row.requestedAt))}</T>
      </View>
      {finite(row.score) && <T style={styles.score}>변화 점수 {value(row.score)}</T>}
      {row.acoustic && <T style={styles.caption}>MFCC 거리 {value(row.acoustic.mfcc_l2)} · CPP 변화 {value(row.acoustic.cpp_delta, true)}</T>}
      {!!row.reasons.length && <T style={styles.caption}>{recordingReasonText(row.reasons)}</T>}
      {!finite(row.score) && !row.reasons.length && <T style={styles.caption}>{row.state === "no_response" ? "발성 안내에 응답하지 않아 분석하지 못했어요."
        : row.state === "skipped" ? "이 확인 요청을 건너뛰었거나 완료 전에 식사가 종료됐어요." : "이 회차의 변화 점수는 저장되지 않았어요."}</T>}
    </View>)}
  </View>;
}
const styles = StyleSheet.create({
  section: { marginTop: 24, gap: 12 }, heading: { fontSize: 22, fontWeight: "700", color: INK },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: { width: "48%", padding: 13, borderRadius: 12, backgroundColor: "#F1F7F7", gap: 6 },
  label: { fontSize: 12, color: "#667477" }, number: { fontSize: 21, color: TEAL, fontWeight: "700" },
  caption: { fontSize: 13, color: "#647174", lineHeight: 21 },
  chart: { height: 200 }, plot: { position: "absolute", top: 12, left: 30, right: 12, height: 150 },
  tick: { position: "absolute", right: "100%", marginRight: 9, fontSize: 11, color: "#667477" },
  axis: { position: "absolute", top: 159, fontSize: 11, color: "#667477" },
  empty: { backgroundColor: "#F4F5F5", padding: 15, borderRadius: 12, gap: 8 },
  emptyTitle: { fontSize: 15, color: INK, fontWeight: "600", lineHeight: 23 },
  row: { padding: 13, borderWidth: 1, borderColor: "#DFE7E8", borderRadius: 12, gap: 7 },
  selected: { borderColor: TEAL }, between: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 6 },
  rowTitle: { fontSize: 15, fontWeight: "600", color: INK }, score: { fontSize: 17, color: TEAL, fontWeight: "700" },
});
