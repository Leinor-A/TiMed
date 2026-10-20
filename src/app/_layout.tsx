import * as Notifications from "expo-notifications";
import { router, Stack } from "expo-router";
import { useEffect } from "react";
import { initializeDatabase } from "../database/database";

export const unstable_settings = {
  initialRouteName: "welcome",
};

function openMedicationReminder(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data;

  // Ignore notifications unrelated to medication reminders.
  if (data?.type !== "medication-reminder") {
    return;
  }

  const medicationId = data.medicationId;
  const scheduledDate = data.scheduledDate;
  const scheduledTime = data.scheduledTime;

  if (
    typeof medicationId !== "number" ||
    typeof scheduledDate !== "string" ||
    typeof scheduledTime !== "string"
  ) {
    console.warn("[TiMed] Invalid medication notification data.");
    return;
  }

  router.push({
    pathname: "/reminder",
    params: {
      medicationId: String(medicationId),
      scheduledDate,
      scheduledTime,
    },
  });
}

export default function RootLayout() {
  useEffect(() => {
    const setupDatabase = async () => {
      try {
        await initializeDatabase();
      } catch (error) {
        console.error("Failed to initialize TiMed database:", error);
      }
    };

    setupDatabase();
  }, []);

  useEffect(() => {
    // Handle a notification tapped while the app is running.
    const subscription = Notifications.addNotificationResponseReceivedListener(
      openMedicationReminder,
    );

    // Handle a notification that launched the app.
    const checkInitialNotification = async () => {
      try {
        const response = await Notifications.getLastNotificationResponseAsync();

        if (response) {
          openMedicationReminder(response);
        }
      } catch (error) {
        console.warn("[TiMed] Failed to check initial notification:", error);
      }
    };

    checkInitialNotification();

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <Stack
      initialRouteName="welcome"
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="reminder" />
      <Stack.Screen name="visual-check" />
    </Stack>
  );
}
