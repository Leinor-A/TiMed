import { useFocusEffect } from "expo-router";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
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
  getLogsForDate,
  type MedicationLog,
} from "../../services/adherenceService";

import {
  getAllMedications,
  type StoredMedication,
} from "../../services/medicationService";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const HOUR_MS = 60 * 60 * 1000;

type ScheduledDose = {
  key: string;
  medicationId: number;
  name: string;
  dosage: string;
  time: string;
  timestamp: number;
};

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDateTime(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute);
}

function displayTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

function dosesForDate(
  medications: StoredMedication[],
  selectedDate: Date,
): ScheduledDose[] {
  const dateKey = formatLocalDate(selectedDate);
  const dayStart = new Date(
    selectedDate.getFullYear(),
    selectedDate.getMonth(),
    selectedDate.getDate(),
  ).getTime();
  const dayEnd = new Date(
    selectedDate.getFullYear(),
    selectedDate.getMonth(),
    selectedDate.getDate() + 1,
  ).getTime();

  const doses: ScheduledDose[] = [];

  for (const medication of medications) {
    if (
      dateKey < medication.startDate ||
      (medication.endDate !== null && dateKey > medication.endDate)
    ) {
      continue;
    }

    if (medication.frequency === "Every X Hours") {
      const interval = medication.intervalHours;
      const firstTime = medication.firstReminderTime;
      if (
        !interval ||
        !Number.isInteger(interval) ||
        interval < 1 ||
        !firstTime ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(firstTime)
      ) {
        continue;
      }

      const firstTimestamp = parseLocalDateTime(
        medication.startDate,
        firstTime,
      ).getTime();
      const intervalMs = interval * HOUR_MS;
      const firstIndex = Math.max(
        0,
        Math.ceil((dayStart - firstTimestamp) / intervalMs),
      );

      for (
        let index = firstIndex;
        firstTimestamp + index * intervalMs < dayEnd;
        index++
      ) {
        const timestamp = firstTimestamp + index * intervalMs;
        if (timestamp < dayStart) continue;

        const occurrence = new Date(timestamp);
        const time = `${String(occurrence.getHours()).padStart(2, "0")}:${String(occurrence.getMinutes()).padStart(2, "0")}`;

        doses.push({
          key: `${medication.id}-${timestamp}`,
          medicationId: medication.id,
          name: medication.name,
          dosage: medication.dosage,
          time,
          timestamp,
        });
      }
    } else {
      for (const time of medication.reminderTimes) {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) continue;
        const timestamp = parseLocalDateTime(dateKey, time).getTime();
        doses.push({
          key: `${medication.id}-${timestamp}`,
          medicationId: medication.id,
          name: medication.name,
          dosage: medication.dosage,
          time,
          timestamp,
        });
      }
    }
  }

  return doses.sort(
    (a, b) => a.timestamp - b.timestamp || a.name.localeCompare(b.name),
  );
}

export default function ScheduleScreen() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [displayedMonth, setDisplayedMonth] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [medications, setMedications] = useState<StoredMedication[]>([]);
  const [doseLogs, setDoseLogs] = useState<MedicationLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const selectedDateKey = formatLocalDate(selectedDate);

  // Reload both medication definitions and the selected day's saved dose logs.
  // This also refreshes statuses when returning from the follow-up screen.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setIsLoading(true);
      setLoadError(null);

      const loadSchedule = async () => {
        try {
          const [items, logs] = await Promise.all([
            getAllMedications(),
            getLogsForDate(selectedDateKey),
          ]);

          if (active) {
            setMedications(items);
            setDoseLogs(logs);
          }
        } catch (error) {
          console.error("Failed to load schedule:", error);
          if (active) {
            setLoadError(
              "Unable to load saved medications and dose statuses. Please try again.",
            );
          }
        } finally {
          if (active) setIsLoading(false);
        }
      };

      void loadSchedule();
      return () => {
        active = false;
      };
    }, [selectedDateKey]),
  );

  const year = displayedMonth.getFullYear();
  const month = displayedMonth.getMonth();

  const monthTitle = displayedMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const calendarCells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const changeMonth = (offset: number) => {
    setDisplayedMonth(new Date(year, month + offset, 1));
  };

  const selectDay = (day: number) => {
    setSelectedDate(new Date(year, month, day));
  };

  const isSelected = (day: number) =>
    selectedDate.getFullYear() === year &&
    selectedDate.getMonth() === month &&
    selectedDate.getDate() === day;

  const isToday = (day: number) => {
    const today = new Date();
    return (
      today.getFullYear() === year &&
      today.getMonth() === month &&
      today.getDate() === day
    );
  };

  const selectedDateLabel = selectedDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const scheduledDoses = useMemo(
    () => dosesForDate(medications, selectedDate),
    [medications, selectedDate],
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Screen Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Schedule</Text>
          <CalendarDays size={25} color="#FFFFFF" />
        </View>

        <Text style={styles.subtitle}>View your medication schedule</Text>

        {/* Calendar Card */}
        <View style={styles.calendarCard}>
          <View style={styles.monthHeader}>
            <Pressable
              onPress={() => changeMonth(-1)}
              style={styles.arrowButton}
            >
              <ChevronLeft size={24} color="#FFFFFF" />
            </Pressable>

            <Text style={styles.monthTitle}>{monthTitle}</Text>

            <Pressable
              onPress={() => changeMonth(1)}
              style={styles.arrowButton}
            >
              <ChevronRight size={24} color="#FFFFFF" />
            </Pressable>
          </View>

          {/* Weekday Labels */}
          <View style={styles.calendarRow}>
            {WEEKDAYS.map((day, index) => (
              <View key={index} style={styles.dayCell}>
                <Text style={styles.weekdayText}>{day}</Text>
              </View>
            ))}
          </View>

          {/* Calendar Dates */}
          <View style={styles.calendarGrid}>
            {calendarCells.map((day, index) => (
              <View key={index} style={styles.dayCell}>
                {day !== null ? (
                  <Pressable
                    onPress={() => selectDay(day)}
                    style={[
                      styles.dateButton,
                      isSelected(day) && styles.selectedDate,
                      !isSelected(day) && isToday(day) && styles.todayDate,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dateText,
                        isSelected(day) && styles.selectedDateText,
                      ]}
                    >
                      {day}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        </View>

        {/* Selected Date */}
        <Text style={styles.sectionTitle}>Medications</Text>
        <Text style={styles.selectedDateLabel}>{selectedDateLabel}</Text>

        {isLoading ? (
          <View style={styles.messageContainer}>
            <ActivityIndicator color="#B7E8F7" />
            <Text style={styles.messageText}>Loading your schedule...</Text>
          </View>
        ) : loadError ? (
          <Text style={styles.errorText}>{loadError}</Text>
        ) : scheduledDoses.length === 0 ? (
          <View style={styles.emptyCard}>
            <CalendarDays size={24} color="#AFC2EA" />
            <Text style={styles.emptyTitle}>No medications scheduled</Text>
            <Text style={styles.emptyDescription}>
              There are no saved medication doses for this date.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.doseCount}>
              {scheduledDoses.length}{" "}
              {scheduledDoses.length === 1 ? "dose" : "doses"} scheduled
            </Text>
            {scheduledDoses.map((dose) => {
              const log = doseLogs.find(
                (entry) =>
                  entry.medicationId === dose.medicationId &&
                  entry.scheduledDate === selectedDateKey &&
                  entry.scheduledTime === dose.time,
              );
              const status = log?.status ?? "Scheduled";

              return (
                <View key={dose.key} style={styles.medicationCard}>
                  <View
                    style={[
                      styles.statusDot,
                      status === "Taken"
                        ? styles.takenDot
                        : status === "Missed"
                          ? styles.missedDot
                          : styles.upcomingDot,
                    ]}
                  />

                  <View style={styles.medicationDetails}>
                    <Text style={styles.medicationName}>{dose.name}</Text>
                    <Text style={styles.medicationInfo}>
                      {dose.dosage} • {displayTime(dose.time)}
                    </Text>
                  </View>

                  <Text
                    style={[
                      styles.medicationStatus,
                      status === "Taken" && styles.takenStatus,
                      status === "Missed" && styles.missedStatus,
                    ]}
                  >
                    {status}
                  </Text>
                </View>
              );
            })}
          </>
        )}

        <Text style={styles.sampleNote}>
          Dose statuses reflect records saved on this device. An unconfirmed
          dose remains Scheduled until a response is recorded. Reminder
          notifications are not yet implemented.
        </Text>
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
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  subtitle: {
    fontSize: 14,
    color: "#C0CBE9",
    marginTop: 8,
    marginBottom: 25,
  },
  calendarCard: {
    backgroundColor: "#293F7A",
    borderRadius: 20,
    padding: 15,
    marginBottom: 30,
  },
  monthHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  arrowButton: {
    padding: 6,
  },
  calendarRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: "14.2857%",
    height: 43,
    justifyContent: "center",
    alignItems: "center",
  },
  weekdayText: {
    color: "#BBC8E8",
    fontSize: 13,
    fontWeight: "600",
  },
  dateButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  selectedDate: {
    backgroundColor: "#F3A2B5",
  },
  todayDate: {
    borderWidth: 1.5,
    borderColor: "#8BD8F7",
  },
  dateText: {
    color: "#FFFFFF",
    fontSize: 14,
  },
  selectedDateText: {
    color: "#172448",
    fontWeight: "bold",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 6,
  },
  selectedDateLabel: {
    fontSize: 14,
    color: "#C0CBE9",
    marginBottom: 18,
  },
  medicationCard: {
    backgroundColor: "#263968",
    borderRadius: 16,
    padding: 17,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  statusDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    marginRight: 14,
  },
  upcomingDot: {
    backgroundColor: "#D5DBFF",
  },
  takenDot: {
    backgroundColor: "#B8F1DF",
  },
  missedDot: {
    backgroundColor: "#F5B8C4",
  },
  medicationDetails: {
    flex: 1,
  },
  medicationName: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 5,
  },
  medicationInfo: {
    color: "#C5D0ED",
    fontSize: 12,
  },
  medicationStatus: {
    color: "#D5DBFF",
    fontSize: 12,
    marginLeft: 8,
  },
  takenStatus: {
    color: "#B8F1DF",
  },
  missedStatus: {
    color: "#F5B8C4",
  },
  sampleNote: {
    color: "#A9B8D6",
    fontSize: 12,
    lineHeight: 19,
    marginTop: 15,
    fontStyle: "italic",
  },
  doseCount: {
    color: "#AFC2EA",
    fontSize: 12,
    marginBottom: 12,
  },
  messageContainer: {
    alignItems: "center",
    paddingVertical: 25,
    gap: 12,
  },
  messageText: {
    color: "#C0CBE9",
    fontSize: 13,
  },
  errorText: {
    color: "#F5B8C4",
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 15,
  },
  emptyCard: {
    backgroundColor: "#263968",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    gap: 10,
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  emptyDescription: {
    color: "#C0CBE9",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
  },
});
