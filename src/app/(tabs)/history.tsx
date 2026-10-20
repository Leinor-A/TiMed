import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
    getLogsForMedication,
    type MedicationLog,
} from "../../services/adherenceService";
import {
    getAllMedications,
    type StoredMedication,
} from "../../services/medicationService";

type HistoryEntry = MedicationLog & {
  medicationName: string;
  dosage: string;
};

function displayTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

function displayDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function HistoryScreen() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        setIsLoading(true);
        setError(null);
        try {
          const medications: StoredMedication[] = await getAllMedications();
          const logGroups = await Promise.all(
            medications.map(async (medication) => {
              const logs = await getLogsForMedication(medication.id);
              return logs.map(
                (log): HistoryEntry => ({
                  ...log,
                  medicationName: medication.name,
                  dosage: medication.dosage,
                }),
              );
            }),
          );
          const history = logGroups
            .flat()
            .filter((log) => log.status === "Taken" || log.status === "Missed")
            .sort((a, b) => {
              const dateOrder = b.scheduledDate.localeCompare(a.scheduledDate);
              if (dateOrder !== 0) return dateOrder;
              const timeOrder = b.scheduledTime.localeCompare(a.scheduledTime);
              return timeOrder !== 0 ? timeOrder : b.id - a.id;
            });
          if (active) setEntries(history);
        } catch (cause) {
          console.error("Failed to load medication history:", cause);
          if (active)
            setError("Unable to load medication history. Please try again.");
        } finally {
          if (active) setIsLoading(false);
        }
      };
      void load();
      return () => {
        active = false;
      };
    }, [reloadKey]),
  );

  const takenCount = entries.filter((entry) => entry.status === "Taken").length;
  const missedCount = entries.filter(
    (entry) => entry.status === "Missed",
  ).length;
  const recordedCount = takenCount + missedCount;
  const adherencePercent =
    recordedCount > 0 ? Math.round((takenCount / recordedCount) * 100) : null;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>History</Text>
        <Text style={styles.subtitle}>Your recorded medication adherence</Text>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Recorded Dose Summary</Text>
          <Text style={styles.summaryTitle}>
            {isLoading
              ? "Loading history..."
              : `${recordedCount} Recorded ${recordedCount === 1 ? "Dose" : "Doses"}`}
          </Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryNumber}>{takenCount}</Text>
              <Text style={styles.summaryItemLabel}>Taken</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryNumber}>{missedCount}</Text>
              <Text style={styles.summaryItemLabel}>Missed</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryNumber}>
                {adherencePercent === null ? "—" : `${adherencePercent}%`}
              </Text>
              <Text style={styles.summaryItemLabel}>Recorded adherence</Text>
            </View>
          </View>
          <Text style={styles.summaryNote}>
            Percentage is based only on doses explicitly recorded as Taken or
            Missed, not all scheduled doses.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Medication Records</Text>
        {isLoading ? (
          <View style={styles.messageCard}>
            <ActivityIndicator color="#B7E8F7" />
            <Text style={styles.messageText}>Loading records...</Text>
          </View>
        ) : error ? (
          <View style={styles.messageCard}>
            <Text style={styles.messageText}>{error}</Text>
            <Pressable
              style={styles.retryButton}
              onPress={() => setReloadKey((key) => key + 1)}
            >
              <Text style={styles.retryText}>Try Again</Text>
            </Pressable>
          </View>
        ) : entries.length === 0 ? (
          <View style={styles.messageCard}>
            <Text style={styles.emptyIcon}>🕘</Text>
            <Text style={styles.emptyTitle}>No recorded doses yet</Text>
            <Text style={styles.messageText}>
              When you confirm a dose as Taken or Missed, it will appear here.
            </Text>
          </View>
        ) : (
          entries.map((entry) => (
            <View key={entry.id} style={styles.recordCard}>
              <View style={styles.pillIcon}>
                <Text style={styles.pillEmoji}>💊</Text>
              </View>
              <View style={styles.recordDetails}>
                <Text style={styles.medicationName}>
                  {entry.medicationName}
                </Text>
                <Text style={styles.medicationInfo}>{entry.dosage}</Text>
                <Text style={styles.medicationDate}>
                  {displayDate(entry.scheduledDate)} •{" "}
                  {displayTime(entry.scheduledTime)}
                </Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  entry.status === "Taken"
                    ? styles.takenBadge
                    : styles.missedBadge,
                ]}
              >
                <Text style={styles.statusText}>{entry.status}</Text>
              </View>
            </View>
          ))
        )}
        <Text style={styles.footerNote}>
          These records reflect user-reported dose outcomes. They do not verify
          medication ingestion.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#101B3D" },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 130 },
  title: { fontSize: 32, fontWeight: "bold", color: "#FFFFFF" },
  subtitle: { fontSize: 14, color: "#C0CBE9", marginTop: 6, marginBottom: 28 },
  summaryCard: {
    backgroundColor: "#364F91",
    borderRadius: 20,
    padding: 22,
    marginBottom: 30,
  },
  summaryLabel: { color: "#E3EAFF", fontSize: 14, marginBottom: 10 },
  summaryTitle: {
    color: "#FFFFFF",
    fontSize: 23,
    fontWeight: "bold",
    marginBottom: 20,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  summaryItem: { flex: 1 },
  summaryNumber: { color: "#FFFFFF", fontSize: 21, fontWeight: "bold" },
  summaryItemLabel: { color: "#D2DDF7", fontSize: 11, marginTop: 6 },
  summaryNote: {
    color: "#D2DDF7",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 18,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "bold",
    marginBottom: 15,
  },
  recordCard: {
    backgroundColor: "#263968",
    borderRadius: 16,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  pillIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#435A91",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  pillEmoji: { fontSize: 23 },
  recordDetails: { flex: 1 },
  medicationName: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  medicationInfo: { color: "#C5D0ED", fontSize: 12 },
  medicationDate: { color: "#A9B8D6", fontSize: 11, marginTop: 7 },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    marginLeft: 8,
  },
  takenBadge: { backgroundColor: "#B8F1DF" },
  missedBadge: { backgroundColor: "#F5B8C4" },
  statusText: { color: "#182A4C", fontSize: 11, fontWeight: "600" },
  messageCard: {
    backgroundColor: "#263968",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    gap: 12,
  },
  messageText: {
    color: "#C5D0ED",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
  },
  emptyIcon: { fontSize: 28 },
  emptyTitle: { color: "#FFFFFF", fontSize: 17, fontWeight: "bold" },
  retryButton: {
    backgroundColor: "#B7E8F7",
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: { color: "#173A70", fontWeight: "bold" },
  footerNote: {
    color: "#A9B8D6",
    fontSize: 12,
    lineHeight: 19,
    marginTop: 20,
    textAlign: "center",
  },
});
