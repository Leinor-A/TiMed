import { router, useLocalSearchParams } from "expo-router";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getMedicationById, type StoredMedication } from "../services/medicationService";
import { getDoseLog, markDoseMissed, markDoseTaken, type MedicationLog } from "../services/adherenceService";
import { requestNotificationPermission, scheduleTestNotification } from "../services/notificationService";

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
}

function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function doseDateTime(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes);
}

function formatTime(value: string): string {
  const [hours, minutes] = value.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function ReminderScreen() {
  const params = useLocalSearchParams<{
    medicationId?: string;
    scheduledDate?: string;
    scheduledTime?: string;
  }>();

  const medicationId = typeof params.medicationId === "string" ? Number(params.medicationId) : NaN;
  const scheduledDate = typeof params.scheduledDate === "string" ? params.scheduledDate : "";
  const scheduledTime = typeof params.scheduledTime === "string" ? params.scheduledTime : "";
  const validParams =
    Number.isSafeInteger(medicationId) && medicationId > 0 &&
    isValidDate(scheduledDate) && isValidTime(scheduledTime);

  const [medication, setMedication] = useState<StoredMedication | null>(null);
  const [doseLog, setDoseLog] = useState<MedicationLog | null>(null);
  const [loading, setLoading] = useState(validParams);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [snoozing, setSnoozing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadDose = useCallback(async () => {
    if (!validParams) return;
    setLoading(true);
    setLoadError(null);
    try {
      const savedMedication = await getMedicationById(medicationId);
      if (!savedMedication) {
        setMedication(null);
        setDoseLog(null);
        setLoadError("This medication could not be found. It may have been deleted.");
        return;
      }
      const scheduledForMedication =
        scheduledDate >= savedMedication.startDate &&
        (!savedMedication.endDate || scheduledDate <= savedMedication.endDate) &&
        savedMedication.reminderTimes.includes(scheduledTime);
      if (!scheduledForMedication) {
        setMedication(null);
        setDoseLog(null);
        setLoadError("This dose does not match the medication's saved schedule.");
        return;
      }
      const log = await getDoseLog(medicationId, scheduledDate, scheduledTime);
      setMedication(savedMedication);
      setDoseLog(log);
    } catch (error) {
      console.error("[TiMed] Failed to load reminder:", error);
      setLoadError("Unable to load this medication reminder.");
    } finally {
      setLoading(false);
    }
  }, [validParams, medicationId, scheduledDate, scheduledTime]);

  useEffect(() => {
    void loadDose();
  }, [loadDose]);

  const saveResponse = async (response: "Taken" | "Missed") => {
    if (!medication || saving || !validParams || doseLog?.status === "Taken") return;
    if (response === "Missed" && doseDateTime(scheduledDate, scheduledTime).getTime() >= Date.now()) {
      Alert.alert("Dose Not Overdue", "This dose is not overdue yet. Leave it unconfirmed if you plan to respond later.");
      return;
    }
    setSaving(true);
    try {
      if (response === "Taken") {
        await markDoseTaken(medicationId, scheduledDate, scheduledTime);
      } else {
        await markDoseMissed(medicationId, scheduledDate, scheduledTime);
      }
      const updatedLog = await getDoseLog(medicationId, scheduledDate, scheduledTime);
      setDoseLog(updatedLog);
      Alert.alert(
        "Response Saved",
        response === "Taken"
          ? "Recorded as Taken based on your confirmation, not computer vision verification."
          : "Recorded as Missed. Follow your prescribed missed-dose instructions or ask your pharmacist if unsure.",
      );
    } catch (error) {
      console.error("[TiMed] Failed to save dose:", error);
      Alert.alert("Unable to Save", "Your response could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const confirmResponse = (response: "Taken" | "Missed") => {
    if (!medication || saving) return;
    Alert.alert(
      response === "Taken" ? "Confirm Taken Dose" : "Confirm Missed Dose",
      response === "Taken"
        ? `Did you actually take ${medication.name}, scheduled for ${formatTime(scheduledTime)}?`
        : `Are you confirming that you did not take ${medication.name}, scheduled for ${formatTime(scheduledTime)}?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", onPress: () => void saveResponse(response) },
      ],
    );
  };

  // Snooze creates a follow-up alert for the SAME scheduled dose.
  // It never changes the medication schedule or the adherence log.
  const snoozeReminder = async () => {
    if (!medication || !validParams || snoozing || saving || doseLog?.status === "Taken" || doseLog?.status === "Missed") return;

    setSnoozing(true);
    try {
      const permitted = await requestNotificationPermission();
      if (!permitted) {
        Alert.alert("Notifications Disabled", "Enable TiMed notifications in your device settings to use Remind Me Later.");
        return;
      }

      // Remove only prior snoozes for this exact dose; never cancel the
      // medication's regular scheduled reminders.
      const pending = await Notifications.getAllScheduledNotificationsAsync();
      for (const notification of pending) {
        const data = notification.content.data;
        if (
          data?.type === "medication-reminder" &&
          data?.isSnooze === true &&
          data?.medicationId === medicationId &&
          data?.scheduledDate === scheduledDate &&
          data?.scheduledTime === scheduledTime
        ) {
          await Notifications.cancelScheduledNotificationAsync(notification.identifier);
        }
      }

      const snoozeDate = new Date(Date.now() + 5 * 60 * 1000);
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "🔔 TiMed Medication Follow-Up",
          body: `Please confirm your ${medication.name} (${medication.dosage}) dose scheduled for ${formatTime(scheduledTime)}.`,
          sound: "timed-alert.wav",
          data: {
            type: "medication-reminder",
            medicationId,
            scheduledDate,
            scheduledTime,
            isSnooze: true,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: snoozeDate,
          channelId: Platform.OS === "android" ? "medication-reminders-v2" : undefined,
        },
      });
      Alert.alert("Reminder Snoozed", "TiMed will send another notification in about 5 minutes. Your medication schedule and adherence status have not changed.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error("[TiMed] Unable to snooze reminder:", error);
      Alert.alert("Snooze Unavailable", "TiMed could not schedule another notification. Please try again.");
    } finally {
      setSnoozing(false);
    }
  };

  const sendTest = async () => {
    if (testing) return;
    setTesting(true);
    try {
      await scheduleTestNotification();
      Alert.alert("Test Scheduled", "A test notification should appear in approximately 10 seconds. It will not change any medication records.");
    } catch (error) {
      Alert.alert("Notification Error", error instanceof Error ? error.message : "Could not schedule a test notification.");
    } finally {
      setTesting(false);
    }
  };

  const status = doseLog?.status ?? "Unconfirmed";
  const isTaken = status === "Taken";
  const isMissed = status === "Missed";
  const isOverdue = validParams && doseDateTime(scheduledDate, scheduledTime).getTime() < Date.now();

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Medication Reminder</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!validParams ? (
          <View style={styles.card}>
            <Text style={styles.icon}>🔔</Text>
            <Text style={styles.title}>Notification Test</Text>
            <Text style={styles.description}>
              This screen was opened without a scheduled medication reminder. You can test local notifications here.
            </Text>
            <Pressable style={[styles.primaryButton, testing && styles.disabled]} disabled={testing} onPress={() => void sendTest()}>
              {testing ? <ActivityIndicator color="#173A70" /> : <Text style={styles.primaryButtonText}>Send Test Notification</Text>}
            </Pressable>
            <Text style={styles.note}>Test notifications do not update adherence records.</Text>
          </View>
        ) : loading ? (
          <View style={styles.card}>
            <ActivityIndicator color="#B7E8F7" />
            <Text style={styles.description}>Loading your scheduled dose...</Text>
          </View>
        ) : loadError || !medication ? (
          <View style={styles.card}>
            <Text style={styles.title}>Reminder Unavailable</Text>
            <Text style={styles.description}>{loadError ?? "Unable to find this medication."}</Text>
            <Pressable style={styles.secondaryButton} onPress={() => void loadDose()}>
              <Text style={styles.secondaryButtonText}>Try Again</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.heroCard}>
              <Text style={styles.icon}>💊</Text>
              <Text style={styles.eyebrow}>🔔 TIME FOR YOUR MEDICATION</Text>
              <Text style={styles.title}>{medication.name}</Text>
              <Text style={styles.dosage}>{medication.dosage}</Text>
              <View style={styles.divider} />
              <Text style={styles.detailLabel}>Scheduled for</Text>
              <Text style={styles.detailValue}>{formatDate(scheduledDate)}</Text>
              <Text style={styles.reminderTime}>{formatTime(scheduledTime)}</Text>
              <View style={styles.statusBadge}>
                <Text style={styles.statusText}>Status: {status}</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Optional Visual Pill Check</Text>
            <Text style={styles.description}>
              You can compare a photograph with TiMed's experimental appearance model. This cannot identify a pill reliably or confirm that you took it.
            </Text>
            <Pressable
              accessibilityRole="button"
              style={styles.visualButton}
              onPress={() => router.push({ pathname: "/visual-check", params: { medicationId: String(medication.id) } })}
            >
              <Text style={styles.visualButtonText}>📷 Open Visual Pill Check</Text>
            </Pressable>

            <Text style={styles.sectionTitle}>Record Your Response</Text>
            <Text style={styles.description}>
              Record what actually happened. Photo analysis never updates your adherence status.
            </Text>
            {isTaken ? (
              <View style={styles.resolvedCard}>
                <Text style={styles.resolvedText}>✓ This dose has already been recorded as Taken.</Text>
              </View>
            ) : (
              <>
                <Pressable
                  accessibilityRole="button"
                  style={[styles.takenButton, saving && styles.disabled]}
                  disabled={saving}
                  onPress={() => confirmResponse("Taken")}
                >
                  <Text style={styles.takenText}>{saving ? "Saving..." : "I Already Took It"}</Text>
                </Pressable>
                {isMissed ? (
                  <Text style={styles.note}>This dose was recorded as Missed. If you need to correct the record, you can confirm Taken only if you actually took it.</Text>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    style={[styles.missedButton, (saving || !isOverdue) && styles.disabled]}
                    disabled={saving || !isOverdue}
                    onPress={() => confirmResponse("Missed")}
                  >
                    <Text style={styles.missedText}>I Didn't Take It</Text>
                  </Pressable>
                )}
                {!isOverdue && !isMissed && (
                  <Text style={styles.note}>The Missed option becomes available after the scheduled time has passed.</Text>
                )}
                {!isMissed && (
                  <Pressable
                    accessibilityRole="button"
                    style={[styles.snoozeButton, (saving || snoozing) && styles.disabled]}
                    disabled={saving || snoozing}
                    onPress={() => void snoozeReminder()}
                  >
                    <Text style={styles.snoozeText}>{snoozing ? "Scheduling..." : "🔔 Remind Me in 5 Minutes"}</Text>
                  </Pressable>
                )}
                <Pressable style={styles.laterButton} onPress={() => router.back()} disabled={saving || snoozing}>
                  <Text style={styles.laterText}>Close Without Recording</Text>
                </Pressable>
              </>
            )}
            <Text style={styles.disclaimer}>
              TiMed tracks self-reported adherence. Neither self-report nor a photograph proves ingestion. If you missed a dose, follow your prescribed instructions or consult a qualified healthcare professional.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#101B3D" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  backButton: { minWidth: 65 },
  backText: { color: "#B7E8F7", fontSize: 16, fontWeight: "600" },
  headerTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
  headerSpacer: { width: 65 },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 70 },
  card: { backgroundColor: "#263968", borderRadius: 18, padding: 22, alignItems: "center", gap: 14 },
  heroCard: { backgroundColor: "#263968", borderRadius: 18, padding: 22, alignItems: "center", marginBottom: 24 },
  icon: { fontSize: 60, marginBottom: 12 },
  eyebrow: { color: "#B7E8F7", fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 10 },
  title: { color: "#FFFFFF", fontSize: 30, fontWeight: "800", textAlign: "center", marginBottom: 10 },
  dosage: { color: "#C5D0ED", fontSize: 16, marginBottom: 6 },
  divider: { height: 1, backgroundColor: "#435A91", width: "100%", marginVertical: 18 },
  detailLabel: { color: "#AEBEDE", fontSize: 12, marginBottom: 6 },
  detailValue: { color: "#FFFFFF", fontSize: 15, fontWeight: "600", marginBottom: 5, textAlign: "center" },
  reminderTime: { color: "#B7E8F7", fontSize: 34, fontWeight: "800", marginTop: 8, textAlign: "center" },
  statusBadge: { marginTop: 16, borderRadius: 20, backgroundColor: "#435A91", paddingHorizontal: 16, paddingVertical: 8 },
  statusText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  sectionTitle: { color: "#FFFFFF", fontSize: 19, fontWeight: "700", marginBottom: 9 },
  description: { color: "#C0CBE9", fontSize: 14, lineHeight: 22, marginBottom: 18, textAlign: "left" },
  visualButton: { backgroundColor: "#364F91", borderWidth: 1, borderColor: "#B7E8F7", borderRadius: 13, paddingVertical: 16, alignItems: "center", marginBottom: 28 },
  visualButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  takenButton: { backgroundColor: "#B8F1DF", borderRadius: 13, paddingVertical: 16, alignItems: "center", marginBottom: 12 },
  takenText: { color: "#173A43", fontSize: 15, fontWeight: "700" },
  missedButton: { backgroundColor: "#F5B8C4", borderRadius: 13, paddingVertical: 16, alignItems: "center", marginBottom: 12 },
  missedText: { color: "#5A2030", fontSize: 15, fontWeight: "700" },
  resolvedCard: { backgroundColor: "#263968", padding: 18, borderRadius: 13 },
  resolvedText: { color: "#B8F1DF", fontSize: 14, fontWeight: "700", textAlign: "center" },
  snoozeButton: { backgroundColor: "#F7D995", borderRadius: 13, paddingVertical: 17, alignItems: "center", marginBottom: 12 },
  snoozeText: { color: "#3C321E", fontSize: 16, fontWeight: "800" },
  laterButton: { alignItems: "center", paddingVertical: 14 },
  laterText: { color: "#B7E8F7", fontSize: 14, fontWeight: "600" },
  primaryButton: { backgroundColor: "#B7E8F7", borderRadius: 13, paddingVertical: 16, paddingHorizontal: 24, width: "100%", alignItems: "center" },
  primaryButtonText: { color: "#173A70", fontSize: 15, fontWeight: "700" },
  secondaryButton: { backgroundColor: "#B7E8F7", borderRadius: 12, paddingVertical: 13, paddingHorizontal: 20 },
  secondaryButtonText: { color: "#173A70", fontWeight: "700" },
  disabled: { opacity: 0.45 },
  note: { color: "#A9B8D6", fontSize: 12, lineHeight: 19, textAlign: "center", marginTop: 6, marginBottom: 14 },
  disclaimer: { color: "#A9B8D6", fontSize: 12, lineHeight: 19, textAlign: "center", marginTop: 24 },
});
