import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import type { StoredMedication } from "./medicationService";

const REMINDER_WINDOW_DAYS = 7;
const REMINDER_CHANNEL_ID = "medication-reminders-v2";
const REMINDER_SOUND = "default";

// Display notifications even when TiMed is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Request notification permission.
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
      name: "Medication Reminders",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
    });
  }

  const existingPermission = await Notifications.getPermissionsAsync();

  if (existingPermission.granted) {
    return true;
  }

  const requestedPermission = await Notifications.requestPermissionsAsync();

  return requestedPermission.granted;
}

// Schedule a test notification after 10 seconds.
export async function scheduleTestNotification(): Promise<string> {
  const hasPermission = await requestNotificationPermission();

  if (!hasPermission) {
    throw new Error(
      "Notification permission was not granted. Please enable notifications in your device settings.",
    );
  }

  return Notifications.scheduleNotificationAsync({
    content: {
      title: "💊 TiMed Test Reminder",
      body: "Your local medication notification system is working!",
      sound: REMINDER_SOUND,
      data: {
        type: "test",
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 10,
      channelId: Platform.OS === "android" ? REMINDER_CHANNEL_ID : undefined,
    },
  });
}

// Format a Date as YYYY-MM-DD using local time.
function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// Convert a date and time into a local Date object.
function dateFromLocalParts(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);

  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

// Add days using the device's local timezone.
function addLocalDays(date: Date, days: number): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + days,
    0,
    0,
    0,
    0,
  );
}

// Generate upcoming medication reminder dates.
function getUpcomingDoseTimes(medication: StoredMedication, now: Date): Date[] {
  const upcoming: Date[] = [];

  const windowEnd = addLocalDays(now, REMINDER_WINDOW_DAYS);

  for (let dayOffset = 0; dayOffset < REMINDER_WINDOW_DAYS; dayOffset++) {
    const day = addLocalDays(now, dayOffset);
    const dateKey = formatLocalDate(day);

    if (dateKey < medication.startDate) {
      continue;
    }

    if (medication.endDate && dateKey > medication.endDate) {
      continue;
    }

    for (const reminderTime of medication.reminderTimes) {
      const doseDate = dateFromLocalParts(dateKey, reminderTime);

      if (doseDate > now && doseDate < windowEnd) {
        upcoming.push(doseDate);
      }
    }
  }

  return upcoming.sort((a, b) => a.getTime() - b.getTime());
}

// Cancel pending notifications for a specific medication.
export async function cancelMedicationNotifications(
  medicationId: number,
): Promise<void> {
  const pending = await Notifications.getAllScheduledNotificationsAsync();

  for (const notification of pending) {
    if (
      notification.content.data?.type === "medication-reminder" &&
      notification.content.data?.medicationId === medicationId
    ) {
      await Notifications.cancelScheduledNotificationAsync(
        notification.identifier,
      );
    }
  }
}

// Schedule upcoming medication notifications.
export async function scheduleMedicationNotifications(
  medication: StoredMedication,
): Promise<number> {
  const hasPermission = await requestNotificationPermission();

  if (!hasPermission) {
    throw new Error("Notification permission was not granted.");
  }

  // Remove existing pending notifications for this medication.
  await cancelMedicationNotifications(medication.id);

  const upcomingDoses = getUpcomingDoseTimes(medication, new Date());

  console.log(`[TiMed] Medication: ${medication.name}`);
  console.log(`[TiMed] Reminder times:`, medication.reminderTimes);
  console.log(
    `[TiMed] Upcoming doses:`,
    upcomingDoses.map((date) => date.toString()),
  );

  let scheduledCount = 0;

  for (const doseDate of upcomingDoses) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "💊 Time for your medication",
        body: `${medication.name} — ${medication.dosage}`,
        sound: REMINDER_SOUND,
        data: {
          type: "medication-reminder",
          medicationId: medication.id,
          scheduledDate: formatLocalDate(doseDate),
          scheduledTime:
            `${String(doseDate.getHours()).padStart(2, "0")}:` +
            `${String(doseDate.getMinutes()).padStart(2, "0")}`,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: doseDate,
        channelId: Platform.OS === "android" ? REMINDER_CHANNEL_ID : undefined,
      },
    });

    scheduledCount++;
  }

  console.log(`[TiMed] Scheduled ${scheduledCount} medication notifications.`);

  return scheduledCount;
}

// DEBUGGING: List all pending local notifications.
export async function debugScheduledNotifications(): Promise<void> {
  const notifications = await Notifications.getAllScheduledNotificationsAsync();

  console.log("========== TIMED NOTIFICATION DEBUG ==========");
  console.log("Total pending notifications:", notifications.length);

  for (const notification of notifications) {
    console.log("Notification ID:", notification.identifier);

    console.log("Title:", notification.content.title);

    console.log("Body:", notification.content.body);

    console.log("Data:", JSON.stringify(notification.content.data));

    console.log("Trigger:", JSON.stringify(notification.trigger));

    console.log("----------------------------------------------");
  }

  console.log("==============================================");
}