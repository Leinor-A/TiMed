import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  analyzeRecentAdherence,
  type AdherencePatternReport,
} from "../../services/agentPatternService";
import {
  monitorTodaysMedications,
  type AgentMonitoringResult,
} from "../../services/agentService";

import {
  getLogsForDate,
  markDoseTaken,
  type MedicationLog,
} from "../../services/adherenceService";

import {
  getAllMedications,
  type StoredMedication,
} from "../../services/medicationService";

type ScheduledDose = {
  id: string;
  medicationId: number;
  name: string;
  dosage: string;
  time: string;
};

// Convert 24-hour time into a readable AM/PM format.
function displayTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);

  const hour12 = hours % 12 || 12;
  const period = hours >= 12 ? "PM" : "AM";

  return `${hour12}:${String(minutes).padStart(2, "0")} ${period}`;
}

// Format a date as YYYY-MM-DD using local time.
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// Convert a local date and HH:MM into a timestamp.
function localDateTime(date: string, time: string): number {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);

  return new Date(year, month - 1, day, hours, minutes).getTime();
}

// Determine whether the medication schedule includes today.
function isActiveToday(medication: StoredMedication, today: string): boolean {
  return (
    medication.startDate <= today &&
    (!medication.endDate || medication.endDate >= today)
  );
}

// Generate today's reminder times for an interval schedule.
// Unlike repeating a fixed list daily, this preserves the
// actual interval across midnight and across different days.
function getIntervalTimesForDate(
  medication: StoredMedication,
  today: string,
): string[] {
  if (!medication.intervalHours || !medication.firstReminderTime) {
    return [];
  }

  const intervalMs = medication.intervalHours * 60 * 60 * 1000;

  const firstDose = localDateTime(
    medication.startDate,
    medication.firstReminderTime,
  );

  const dayStart = localDateTime(today, "00:00");
  const nextDayStart = localDateTime(
    formatDate(
      new Date(
        new Date(dayStart).getFullYear(),
        new Date(dayStart).getMonth(),
        new Date(dayStart).getDate() + 1,
      ),
    ),
    "00:00",
  );

  const firstIndex = Math.max(
    0,
    Math.ceil((dayStart - firstDose) / intervalMs),
  );

  const times: string[] = [];

  for (let index = firstIndex; ; index++) {
    const timestamp = firstDose + index * intervalMs;

    if (timestamp >= nextDayStart) {
      break;
    }

    if (timestamp >= dayStart) {
      const date = new Date(timestamp);

      times.push(
        `${String(date.getHours()).padStart(2, "0")}:${String(
          date.getMinutes(),
        ).padStart(2, "0")}`,
      );
    }
  }

  return times;
}

// Expand medication records into today's individual doses.
function getTodaysDoses(
  medications: StoredMedication[],
  today: string,
): ScheduledDose[] {
  const doses: ScheduledDose[] = [];

  for (const medication of medications) {
    if (!isActiveToday(medication, today)) {
      continue;
    }

    const times =
      medication.frequency === "Every X Hours"
        ? getIntervalTimesForDate(medication, today)
        : medication.reminderTimes;

    for (const time of times) {
      doses.push({
        id: `${medication.id}-${time}`,
        medicationId: medication.id,
        name: medication.name,
        dosage: medication.dosage,
        time,
      });
    }
  }

  return doses.sort((a, b) => a.time.localeCompare(b.time));
}

export default function DashboardScreen() {
  const router = useRouter();
  const [agentResult, setAgentResult] = useState<AgentMonitoringResult | null>(
    null,
  );
  const [agentError, setAgentError] = useState(false);
  const [patternReport, setPatternReport] = useState<AdherencePatternReport | null>(null);
  const [patternLoading, setPatternLoading] = useState(true);
  const [patternError, setPatternError] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [medications, setMedications] = useState<StoredMedication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [doseLogs, setDoseLogs] = useState<MedicationLog[]>([]);
  const [savingDoseId, setSavingDoseId] = useState<string | null>(null);

  // Reload saved medications whenever the Dashboard becomes active.
  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      const clockInterval = setInterval(() => setNow(Date.now()), 60_000);

      const loadMedications = async () => {
        setIsLoading(true);
        setLoadError(null);

        try {
          const date = formatDate(new Date());
          const [savedMedications, savedLogs] = await Promise.all([
            getAllMedications(),
            getLogsForDate(date),
          ]);

          if (isActive) {
            setMedications(savedMedications);
            setDoseLogs(savedLogs);
            setNow(Date.now());
          }
        } catch (error) {
          console.error("Failed to load medications:", error);

          if (isActive) {
            setLoadError("Unable to load saved medications.");
          }
        } finally {
          if (isActive) {
            setIsLoading(false);
          }
        }
      };

      loadMedications();

      return () => {
        isActive = false;
        clearInterval(clockInterval);
      };
    }, []),
  );

  // Refresh the agent's follow-up queue on focus and as the clock advances.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const refresh = async () => {
        try {
          const result = await monitorTodaysMedications();
          if (active) {
            setAgentResult(result);
            setAgentError(false);
          }
        } catch (error) {
          console.error("Failed to monitor medications:", error);
          if (active) {
            setAgentError(true);
            setAgentResult(null);
          }
        }
      };
      void refresh();
      const interval = setInterval(() => void refresh(), 60_000);
      return () => {
        active = false;
        clearInterval(interval);
      };
    }, []),
  );

  // Refresh seven-day agent insights on focus and at the next date change.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const refreshPatterns = async () => {
        try {
          const report = await analyzeRecentAdherence();
          if (active) {
            setPatternReport(report);
            setPatternError(false);
          }
        } catch (error) {
          console.error("Failed to analyze adherence patterns:", error);
          if (active) {
            setPatternError(true);
            setPatternReport(null);
          }
        } finally {
          if (active) setPatternLoading(false);
        }
      };

      setPatternLoading(true);
      void refreshPatterns();
      const interval = setInterval(() => void refreshPatterns(), 60_000);
      return () => {
        active = false;
        clearInterval(interval);
      };
    }, []),
  );

  const today = formatDate(new Date(now));

  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const todaysDoses = getTodaysDoses(medications, today);

  const totalDoses = todaysDoses.length;
  const takenDoses = todaysDoses.filter((dose) =>
    doseLogs.some(
      (log) =>
        log.medicationId === dose.medicationId &&
        log.scheduledDate === today &&
        log.scheduledTime === dose.time &&
        log.status === "Taken",
    ),
  ).length;
  const progressPercent = totalDoses > 0 ? (takenDoses / totalDoses) * 100 : 0;

  const handleMarkTaken = async (dose: ScheduledDose) => {
    if (savingDoseId) return;

    const scheduledAt = localDateTime(today, dose.time);
    if (scheduledAt > Date.now()) {
      Alert.alert(
        "Not Yet Due",
        "You can confirm this dose at or after its scheduled time.",
      );
      return;
    }

    setSavingDoseId(dose.id);
    try {
      await markDoseTaken(dose.medicationId, today, dose.time);
      setDoseLogs(await getLogsForDate(today));
      setAgentResult(await monitorTodaysMedications());
      setAgentError(false);
      try {
        setPatternReport(await analyzeRecentAdherence());
        setPatternError(false);
      } catch (patternRefreshError) {
        console.warn("Adherence insight refresh failed:", patternRefreshError);
        setPatternError(true);
      }
    } catch (error) {
      console.error("Failed to mark dose as taken:", error);
      Alert.alert(
        "Unable to Save",
        "Could not record this dose. Please try again.",
      );
    } finally {
      setSavingDoseId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Dashboard Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Dashboard</Text>
            <Text style={styles.subtitle}>Your medication overview</Text>
          </View>

          <Text style={styles.headerIcon}>🔔</Text>
        </View>

        <Pressable onPress={() => router.push("/reminder")}>
          <Text style={{ color: "#B7E8F7" }}>Test Notifications</Text>
        </Pressable>

        {/* Visual Pill Check entry point */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Visual Pill Check"
          style={styles.visualCheckButton}
          onPress={() => router.push("/visual-check")}
        >
          <View style={styles.visualCheckIcon}>
            <Text style={styles.visualCheckEmoji}>📷</Text>
          </View>
          <View style={styles.visualCheckDetails}>
            <Text style={styles.visualCheckTitle}>Visual Pill Check</Text>
            <Text style={styles.visualCheckDescription}>
              Experimental pill appearance comparison
            </Text>
          </View>
          <Text style={styles.visualCheckArrow}>›</Text>
        </Pressable>

        {/* Daily Medication Progress */}
        <View style={styles.progressCard}>
          <Text style={styles.cardLabel}>Today's Schedule</Text>

          <Text style={styles.progressTitle}>
            {isLoading
              ? "Loading schedule..."
              : `${takenDoses} of ${totalDoses} Doses Taken`}
          </Text>

          <Text style={styles.dateText}>{currentDate}</Text>

          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, { width: `${progressPercent}%` }]}
            />
          </View>

          <Text style={styles.progressNote}>
            {totalDoses === 0
              ? "No doses scheduled for today."
              : `${Math.round(progressPercent)}% completed today. Confirm each dose only after taking it.`}
          </Text>
        </View>

        {/* Today's Medications */}
        <Text style={styles.sectionTitle}>Today's Medications</Text>

        {isLoading ? (
          <View style={styles.emptyCard}>
            <ActivityIndicator color="#B7E8F7" />

            <Text style={styles.emptyText}>Loading your medications...</Text>
          </View>
        ) : loadError ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{loadError}</Text>
          </View>
        ) : todaysDoses.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              No medications scheduled for today.
            </Text>

            <Text style={styles.emptyHint}>
              Go to Add Medication to create a schedule.
            </Text>
          </View>
        ) : (
          todaysDoses.map((dose) => {
            const log = doseLogs.find(
              (entry) =>
                entry.medicationId === dose.medicationId &&
                entry.scheduledDate === today &&
                entry.scheduledTime === dose.time,
            );
            const isTaken = log?.status === "Taken";
            const isMissed = log?.status === "Missed";
            const isFuture = localDateTime(today, dose.time) > now;
            const isSavingDose = savingDoseId === dose.id;

            return (
              <View key={dose.id} style={styles.medicationCard}>
                {/* Medication Icon */}
                <View style={styles.medicationIcon}>
                  <Text style={styles.pillEmoji}>💊</Text>
                </View>

                {/* Medication Information */}
                <View style={styles.medicationDetails}>
                  <Text style={styles.medicationName}>{dose.name}</Text>

                  <Text style={styles.medicationInfo}>
                    {dose.dosage} • {displayTime(dose.time)}
                  </Text>
                </View>

                {/* Dose status and confirmation */}
                {isTaken ? (
                  <View style={[styles.scheduledBadge, styles.takenBadge]}>
                    <Text style={styles.statusText}>Taken</Text>
                  </View>
                ) : isMissed ? (
                  <View style={[styles.scheduledBadge, styles.missedBadge]}>
                    <Text style={styles.statusText}>Missed</Text>
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Mark ${dose.name} at ${displayTime(dose.time)} as taken`}
                    style={[
                      styles.scheduledBadge,
                      styles.takeButton,
                      (isFuture || savingDoseId !== null) &&
                        styles.disabledButton,
                    ]}
                    disabled={isFuture || savingDoseId !== null}
                    onPress={() => handleMarkTaken(dose)}
                  >
                    <Text style={styles.statusText}>
                      {isSavingDose
                        ? "Saving..."
                        : isFuture
                          ? "Scheduled"
                          : "Mark Taken"}
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          })
        )}

        {/* Intelligent Agent Activity */}
        <Text style={styles.sectionTitle}>Agent Activity</Text>

        <View style={styles.agentCard}>
          <View style={styles.agentHeader}>
            <Text style={styles.agentIcon}>✦</Text>

            <Text style={styles.agentTitle}>TiMed Agent</Text>
          </View>

          <Text style={styles.agentMessage}>
            {isLoading
              ? "Checking your medication schedule..."
              : loadError || agentError
                ? "Unable to check medication follow-ups right now."
                : agentResult && agentResult.awaitingFollowUp.length > 0
                  ? `You have ${agentResult.awaitingFollowUp.length} unconfirmed ${agentResult.awaitingFollowUp.length === 1 ? "dose" : "doses"} requiring follow-up. ${agentResult.awaitingFollowUp[0].medicationName} was scheduled for ${displayTime(agentResult.awaitingFollowUp[0].scheduledTime)}.`
                  : totalDoses === 0
                    ? "No medications scheduled for today."
                    : "No overdue, unconfirmed doses detected. Keep following your prescribed schedule."}
          </Text>

          {!isLoading &&
            !loadError &&
            !agentError &&
            agentResult &&
            agentResult.awaitingFollowUp.length > 0 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Review medication follow-up"
                style={styles.followUpButton}
                onPress={() => router.push("/follow-up")}
              >
                <Text style={styles.followUpButtonText}>
                  Review Follow-Up →
                </Text>
              </Pressable>
            )}

          <View style={styles.insightsDivider} />
          <Text style={styles.insightsTitle}>7-Day Adherence Insights</Text>
          {patternLoading && !patternReport ? (
            <ActivityIndicator color="#173A70" style={styles.insightsLoading} />
          ) : patternError || !patternReport ? (
            <Text style={styles.agentMessage}>
              Unable to load adherence insights right now.
            </Text>
          ) : (
            <>
              <Text style={styles.insightsPeriod}>
                {patternReport.startDate} to {patternReport.endDate}
              </Text>
              <View style={styles.insightsStatsRow}>
                <View style={styles.insightsStatCard}>
                  <Text style={styles.insightsStatNumber}>
                    {patternReport.totalConfirmedTaken}
                  </Text>
                  <Text style={styles.insightsStatLabel}>Confirmed Taken</Text>
                </View>
                <View style={styles.insightsStatCard}>
                  <Text style={styles.insightsStatNumber}>
                    {patternReport.totalConfirmedMissed}
                  </Text>
                  <Text style={styles.insightsStatLabel}>Confirmed Missed</Text>
                </View>
              </View>
              {patternReport.medications.length === 0 ? (
                <Text style={styles.insightsDescription}>
                  Add a medication to start collecting adherence insights.
                </Text>
              ) : (
                patternReport.medications.map((item) => (
                  <View key={item.medicationId} style={styles.insightMedicationCard}>
                    <Text style={styles.insightMedicationName}>
                      {item.medicationName}
                    </Text>
                    <Text style={styles.insightMedicationCount}>
                      {item.confirmedTaken} Taken · {item.confirmedMissed} Missed
                    </Text>
                    <Text style={styles.insightMedicationMessage}>
                      {item.message}
                    </Text>
                  </View>
                ))
              )}
              <Text style={styles.insightsDescription}>
                These counts include confirmed responses only. Unconfirmed doses
                are not counted as missed. This is adherence support, not medical advice.
              </Text>
            </>
          )}
          <Text style={styles.agentNote}>
            Unconfirmed means no dose confirmation was recorded after the
            prototype grace period. It does not prove the dose was missed.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#101B3D",
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 130,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 28,
  },

  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#FFFFFF",
  },

  subtitle: {
    fontSize: 14,
    color: "#C0CBE9",
    marginTop: 6,
  },

  headerIcon: {
    fontSize: 25,
  },

  visualCheckButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#263968",
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#435A91",
  },
  visualCheckIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#435A91",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  visualCheckEmoji: {
    fontSize: 23,
  },
  visualCheckDetails: {
    flex: 1,
  },
  visualCheckTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  visualCheckDescription: {
    fontSize: 12,
    color: "#C5D0ED",
  },
  visualCheckArrow: {
    fontSize: 28,
    color: "#B7E8F7",
    marginLeft: 8,
  },

  progressCard: {
    backgroundColor: "#364F91",
    borderRadius: 20,
    padding: 22,
    marginBottom: 30,
  },

  cardLabel: {
    color: "#E3EAFF",
    fontSize: 14,
    marginBottom: 10,
  },

  progressTitle: {
    color: "#FFFFFF",
    fontSize: 23,
    fontWeight: "bold",
    marginBottom: 8,
  },

  dateText: {
    color: "#D2DDF7",
    fontSize: 13,
    marginBottom: 20,
  },

  progressTrack: {
    height: 10,
    backgroundColor: "#182D61",
    borderRadius: 10,
    overflow: "hidden",
  },

  progressFill: {
    height: "100%",
    width: "0%",
    backgroundColor: "#8BD8F7",
    borderRadius: 10,
  },

  progressNote: {
    color: "#D2DDF7",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
  },

  sectionTitle: {
    fontSize: 19,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 15,
  },

  medicationCard: {
    backgroundColor: "#263968",
    borderRadius: 16,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },

  medicationIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#435A91",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  pillEmoji: {
    fontSize: 23,
  },

  medicationDetails: {
    flex: 1,
  },

  medicationName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 5,
  },

  medicationInfo: {
    fontSize: 12,
    color: "#C5D0ED",
  },

  scheduledBadge: {
    backgroundColor: "#D5DBFF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    marginLeft: 8,
  },

  takenBadge: {
    backgroundColor: "#B8F1DF",
  },

  missedBadge: {
    backgroundColor: "#F5B8C4",
  },

  takeButton: {
    backgroundColor: "#B7E8F7",
  },

  disabledButton: {
    opacity: 0.65,
  },

  statusText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#182A4C",
  },

  emptyCard: {
    backgroundColor: "#263968",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    alignItems: "center",
    gap: 12,
  },

  emptyText: {
    color: "#C5D0ED",
    fontSize: 14,
    textAlign: "center",
  },

  emptyHint: {
    color: "#A9B8D6",
    fontSize: 12,
    textAlign: "center",
  },

  agentCard: {
    backgroundColor: "#B7E8F7",
    borderRadius: 18,
    padding: 20,
  },

  agentHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },

  agentIcon: {
    fontSize: 23,
    color: "#173A70",
    marginRight: 10,
  },

  agentTitle: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#173A70",
  },

  agentMessage: {
    fontSize: 14,
    lineHeight: 22,
    color: "#21436B",
  },

  followUpButton: {
    alignSelf: "flex-start",
    backgroundColor: "#173A70",
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 15,
    marginTop: 14,
  },

  followUpButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },

  insightsDivider: {
    height: 1,
    backgroundColor: "#91C3D5",
    marginTop: 22,
    marginBottom: 18,
  },
  insightsTitle: {
    color: "#173A70",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 5,
  },
  insightsPeriod: {
    color: "#476985",
    fontSize: 12,
    marginBottom: 14,
  },
  insightsLoading: {
    marginVertical: 16,
  },
  insightsStatsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  insightsStatCard: {
    flex: 1,
    backgroundColor: "#E9F7FD",
    borderRadius: 12,
    padding: 14,
  },
  insightsStatNumber: {
    color: "#173A70",
    fontSize: 24,
    fontWeight: "bold",
  },
  insightsStatLabel: {
    color: "#21436B",
    fontSize: 11,
    marginTop: 4,
  },
  insightMedicationCard: {
    backgroundColor: "#E9F7FD",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  insightMedicationName: {
    color: "#173A70",
    fontSize: 14,
    fontWeight: "bold",
  },
  insightMedicationCount: {
    color: "#476985",
    fontSize: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  insightMedicationMessage: {
    color: "#21436B",
    fontSize: 13,
    lineHeight: 19,
  },
  insightsDescription: {
    color: "#476985",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 8,
  },
  agentNote: {
    fontSize: 11,
    color: "#476985",
    marginTop: 12,
    fontStyle: "italic",
  },
});
