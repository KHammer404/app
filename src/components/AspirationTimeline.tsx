import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import type { MealRecord } from "../state/AppState";
import {
  elapsedLabel,
  eventPosition,
  timelineClock,
  timelineDuration,
  timelineEvents,
} from "../utils/mealTimeline";
import { Icon, T } from "./UI";
import MotionPressable from "./MotionPressable";
import { INK, RED, TEAL } from "./theme";

export default function AspirationTimeline({ record }: { record: MealRecord }) {
  const events = timelineEvents(record),
    totalMs = timelineDuration(record);
  const [selectedId, setSelectedId] = useState(events[0]?.id);
  const [railWidth, setRailWidth] = useState(0);
  const selected = events.find((event) => event.id === selectedId) ?? events[0];
  const start = new Date(record.date),
    end = new Date(start.getTime() + totalMs);
  const selectedTime = selected
    ? new Date(start.getTime() + selected.offsetMs)
    : null;
  const labelLeft = selected
    ? Math.max(
        0,
        Math.min(
          Math.max(0, railWidth - 88),
          eventPosition(selected.offsetMs, totalMs) * railWidth - 44,
        ),
      )
    : 0;
  return (
    <View style={styles.section}>
      <View style={styles.headingRow}>
        <T accessibilityRole="header" style={styles.heading}>
          주의 신호 분석 결과
        </T>
        <View style={[styles.count, record.alerts === 0 && styles.noAlerts]}>
          <T style={[styles.countText, record.alerts === 0 && { color: TEAL }]}>
            {record.alerts}회
          </T>
        </View>
      </View>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.headerLabel}>
            <Icon name="activity" size={17} color="white" />
            <T style={styles.cardTitle}>식사 타임라인</T>
          </View>
          <T style={styles.total}>{elapsedLabel(totalMs)}</T>
        </View>
        <View
          style={styles.rail}
          onLayout={(event) => setRailWidth(event.nativeEvent.layout.width)}
        >
          <View style={styles.track} />
          <View style={[styles.endpoint, { left: -5 }]} />
          <View style={[styles.endpoint, { right: -5 }]} />
          {selected && (
            <View
              pointerEvents="none"
              style={[styles.markerLabel, { left: labelLeft }]}
            >
              <T numberOfLines={1} style={styles.markerLabelText}>
                주의 신호
              </T>
            </View>
          )}
          {events.map((event, index) => (
            <MotionPressable
              key={event.id}
              accessibilityRole="button"
              accessibilityLabel={`주의 신호 ${index + 1}, ${timelineClock(new Date(start.getTime() + event.offsetMs))}`}
              accessibilityState={{ selected: selected?.id === event.id }}
              aria-selected={selected?.id === event.id}
              onPress={() => setSelectedId(event.id)}
              style={[
                styles.hitTarget,
                { left: `${eventPosition(event.offsetMs, totalMs) * 100}%` },
              ]}
            >
              <View
                style={[
                  styles.markerHalo,
                  selected?.id === event.id && styles.selectedHalo,
                ]}
              >
                <View
                  style={[
                    styles.marker,
                    selected?.id === event.id && styles.selectedMarker,
                  ]}
                />
              </View>
            </MotionPressable>
          ))}
          <View style={styles.axis}>
            <View style={{ gap: 4 }}>
              <T style={styles.axisTime}>{timelineClock(start)}</T>
              <T style={styles.axisCaption}>식사 시작</T>
            </View>
            <View style={{ alignItems: "flex-end", gap: 4 }}>
              <T style={styles.axisTime}>{timelineClock(end)}</T>
              <T style={styles.axisCaption}>식사 종료</T>
            </View>
          </View>
        </View>
        {selected && selectedTime ? (
          <View style={styles.detail}>
            <View style={styles.detailIcon}>
              <Icon name="alert-circle" color={RED} size={22} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <T style={styles.detailTitle}>주의 신호</T>
              <T style={styles.detailSubtitle}>
                식사 시작 후 {elapsedLabel(selected.offsetMs)}
              </T>
            </View>
            <T style={styles.detailTime}>{timelineClock(selectedTime)}</T>
          </View>
        ) : (
          <View style={styles.empty}>
            <Icon
              name={record.alerts > 0 ? "clock" : "minus-circle"}
              color="white"
              size={18}
            />
            <T style={styles.emptyText}>
              {record.alerts > 0 ? "알림 시각 미기록" : "주의 신호 없음"}
            </T>
          </View>
        )}
        {events.length > 1 && (
          <View style={styles.eventPicker}>
            {events.map((event, index) => (
              <MotionPressable
                key={event.id}
                accessibilityRole="button"
                accessibilityLabel={`${index + 1}번 알림 상세`}
                onPress={() => setSelectedId(event.id)}
                style={[
                  styles.eventChip,
                  selected?.id === event.id && styles.selectedChip,
                ]}
              >
                <T style={styles.eventChipText}>
                  {index + 1} · {elapsedLabel(event.offsetMs)}
                </T>
              </MotionPressable>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  section: { marginBottom: 28, gap: 17 },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  heading: {
    flex: 1,
    fontSize: 22,
    fontWeight: "700",
    color: INK,
    lineHeight: 31,
    letterSpacing: -0.6,
  },
  count: {
    backgroundColor: "#FCEBEB",
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  noAlerts: { backgroundColor: "#E8F1EF" },
  countText: { fontSize: 13, color: RED, fontWeight: "700" },
  card: { backgroundColor: TEAL, borderRadius: 20, padding: 20 },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  headerLabel: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 14, color: "white", fontWeight: "600" },
  total: { fontSize: 14, color: "#D6F0F2", fontVariant: ["tabular-nums"] },
  rail: { height: 132, marginHorizontal: 8, marginTop: 12 },
  track: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 49,
    height: 3,
    backgroundColor: "#D3ECEE",
    borderRadius: 2,
  },
  endpoint: {
    position: "absolute",
    top: 45,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: "white",
  },
  hitTarget: {
    position: "absolute",
    top: 28,
    width: 44,
    height: 44,
    marginLeft: -22,
    alignItems: "center",
    justifyContent: "center",
  },
  markerHalo: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  selectedHalo: { backgroundColor: "rgba(255,255,255,.2)" },
  marker: {
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: RED,
    borderWidth: 2,
    borderColor: "white",
  },
  selectedMarker: { width: 19, height: 19, borderRadius: 10, borderWidth: 3 },
  markerLabel: {
    position: "absolute",
    top: 4,
    width: 88,
    alignItems: "center",
  },
  markerLabelText: {
    fontSize: 13,
    color: "white",
    fontWeight: "700",
    lineHeight: 22,
  },
  axis: {
    position: "absolute",
    top: 77,
    left: -8,
    right: -8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  axisTime: {
    fontSize: 13,
    color: "white",
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  axisCaption: { fontSize: 11, color: "#CBE9EC" },
  detail: {
    backgroundColor: "#F4FAFA",
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  detailIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FCEBEB",
  },
  detailTitle: { fontSize: 14, fontWeight: "700", color: INK },
  detailSubtitle: { fontSize: 11, color: "#687D80", lineHeight: 18 },
  detailTime: {
    fontSize: 16,
    color: TEAL,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  empty: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 9,
    paddingTop: 4,
    paddingBottom: 8,
  },
  emptyText: { fontSize: 13, color: "white", lineHeight: 21 },
  eventPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  eventChip: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FFFFFF55",
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: "center",
  },
  selectedChip: { backgroundColor: "#FFFFFF22", borderColor: "white" },
  eventChipText: {
    fontSize: 12,
    color: "white",
    fontVariant: ["tabular-nums"],
  },
});
