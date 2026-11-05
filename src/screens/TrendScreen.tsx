import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { api, TrendPoint } from "../api/client";
import { Page } from "../components/AppFrame";
import { Button, T } from "../components/UI";
import { GRAY, RED, s, TEAL } from "../components/theme";

const PERIODS = [
  ["day", "일"],
  ["week", "주"],
  ["month", "월"],
] as const;

function pointLabel(period: (typeof PERIODS)[number][0], label: string) {
  if (period === "day") {
    const [, month, day] = label.split("-");
    return `${Number(month)}/${Number(day)}`;
  }
  if (period === "week") {
    const [year, week] = label.split("-W");
    return `${year}년 ${Number(week)}주`;
  }
  return label;
}

export function TrendScreen() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number][0]>("day");
  const [points, setPoints] = useState<TrendPoint[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let stopped = false;
    void api
      .trend(period)
      .then((result) => {
        if (!stopped) setPoints(result.points);
      })
      .catch(() => {
        if (!stopped) setError("추이를 불러오지 못했어요. 연결을 확인해 주세요.");
      });
    return () => {
      stopped = true;
    };
  }, [period]);
  const peak = Math.max(1, ...points.map((point) => point.swallow_count));
  return (
    <Page>
      <T accessibilityRole="header" style={s.title}>
        변화 추이
      </T>
      <T style={[s.caption, { marginTop: 8 }]}>
        이 보고서는 진단이 아닙니다. 변화 없음 비율은 평소 목소리와의 차이이며, 흡인이 없다는
        뜻이 아니에요.
      </T>
      <View style={[s.chips, { gap: 7 }]}>
        {PERIODS.map(([value, label]) => (
          <Button
            key={value}
            title={label}
            secondary={period !== value}
            onPress={() => {
              setError("");
              setPeriod(value);
            }}
          />
        ))}
      </View>
      {!!error && <T style={[s.body, { color: RED }]}>{error}</T>}
      {points.map((point) => (
        <View key={point.label} style={{ marginTop: 16, gap: 6 }}>
          <View style={s.between}>
            <T style={s.body}>{pointLabel(period, point.label)}</T>
            <T style={s.caption}>
              삼킴 {point.swallow_count}회 · 주의 {point.caution_count}회 · 변화 없음{" "}
              {point.no_change_ratio == null ? "기록 없음" : `${Math.round(point.no_change_ratio * 100)}%`}
            </T>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: "#E6E6E6" }}>
            <View
              style={{
                height: 8,
                borderRadius: 4,
                backgroundColor: point.caution_count ? RED : TEAL,
                width: `${Math.round((point.swallow_count / peak) * 100)}%`,
              }}
            />
          </View>
        </View>
      ))}
      {!points.length && !error && <T style={[s.caption, { color: GRAY }]}>불러오는 중…</T>}
      <View style={s.spacer} />
      <Button title="홈으로" secondary onPress={() => router.replace("/home")} />
    </Page>
  );
}
