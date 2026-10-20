import { router, useFocusEffect } from "expo-router";
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
    monitorTodaysMedications,
    type AgentDose,
} from "../services/agentService";

import { markDoseMissed, markDoseTaken } from "../services/adherenceService";

function displayTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);

  const hour12 = hours % 12 || 12;
  const period = hours >= 12 ? "PM" : "AM";

  return `${hour12}:${String(minutes).padStart(2, "0")} ${period}`;
}

export default function FollowUpScreen() {
  const [doses, setDoses] = useState<AgentDose[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingDoseId, setSavingDoseId] = useState<string | null>(null);

  const loadFollowUps = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const result = await monitorTodaysMedications();
      setDoses(result.awaitingFollowUp);
    } catch (error) {
      console.error("Failed to load follow-ups:", error);
      setLoadError("Unable to load medication follow-ups.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadFollowUps();
    }, [loadFollowUps]),
  );

  const saveResponse = async (
    dose: AgentDose,
    response: "Taken" | "Missed",
  ) => {
    if (savingDoseId !== null) return;

    setSavingDoseId(dose.id);

    try {
      if (response === "Taken") {
        await markDoseTaken(
          dose.medicationId,
          dose.scheduledDate,
          dose.scheduledTime,
        );
      } else {
        await markDoseMissed(
          dose.medicationId,
          dose.scheduledDate,
          dose.scheduledTime,
        );
      }

      // Reload so the resolved dose disappears from follow-up.
      const result = await monitorTodaysMedications();
      setDoses(result.awaitingFollowUp);

      Alert.alert(
        "Response Saved",
        response === "Taken"
          ? "Your dose has been recorded as Taken based on your confirmation. This is not computer vision verification."
          : "Your dose has been recorded as Missed. Follow your prescribed missed-dose instructions or consult your pharmacist if unsure.",
      );
    } catch (error) {
      console.error("Failed to save follow-up:", error);

      Alert.alert(
        "Unable to Save",
        "Your response could not be saved. Please try again.",
      );
    } finally {
      setSavingDoseId(null);
    }
  };

  const confirmResponse = (dose: AgentDose, response: "Taken" | "Missed") => {
    const message =
      response === "Taken"
        ? `Confirm that you already took ${dose.medicationName}, scheduled for ${displayTime(dose.scheduledTime)}?`
        : `Confirm that you did not take ${dose.medicationName}, scheduled for ${displayTime(dose.scheduledTime)}?`;

    Alert.alert(
      response === "Taken" ? "Confirm Taken Dose" : "Confirm Missed Dose",
      message,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: () => {
            void saveResponse(dose, response);
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>

        <Text style={styles.headerTitle}>Agent Follow-Up</Text>

        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.agentCard}>
          <View style={styles.agentHeader}>
            <Text style={styles.agentIcon}>✦</Text>
            <Text style={styles.agentTitle}>TiMed Agent</Text>
          </View>

          <Text style={styles.agentMessage}>
            I'll help you review medication doses that haven't been confirmed.
            Please report what actually happened.
          </Text>

          <Text style={styles.agentNote}>
            An unconfirmed dose is not automatically a missed dose.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Medication Follow-Ups</Text>

        {isLoading ? (
          <View style={styles.emptyCard}>
            <ActivityIndicator color="#B7E8F7" />
            <Text style={styles.emptyText}>
              Checking medication follow-ups...
            </Text>
          </View>
        ) : loadError ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{loadError}</Text>
            <Pressable
              style={styles.retryButton}
              onPress={() => void loadFollowUps()}
            >
              <Text style={styles.retryText}>Try Again</Text>
            </Pressable>
          </View>
        ) : doses.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.emptyTitle}>All Caught Up!</Text>
            <Text style={styles.emptyText}>
              No medication doses currently require follow-up.
            </Text>
          </View>
        ) : (
          doses.map((dose) => (
            <View key={dose.id} style={styles.doseCard}>
              <View style={styles.doseHeader}>
                <View style={styles.medicationIcon}>
                  <Text style={styles.pillEmoji}>💊</Text>
                </View>

                <View style={styles.medicationDetails}>
                  <Text style={styles.medicationName}>
                    {dose.medicationName}
                  </Text>

                  <Text style={styles.medicationInfo}>
                    {dose.dosage} • {displayTime(dose.scheduledTime)}
                  </Text>
                </View>
              </View>

              <View style={styles.statusBadge}>
                <Text style={styles.statusText}>Unconfirmed</Text>
              </View>

              <Text style={styles.question}>
                This medication was scheduled for{" "}
                {displayTime(dose.scheduledTime)}, but I haven't received
                confirmation. Did you take it?
              </Text>

              <Pressable
                accessibilityRole="button"
                style={styles.visualCheckButton}
                disabled={savingDoseId !== null}
                onPress={() =>
                  router.push({
                    pathname: "/visual-check",
                    params: { medicationId: String(dose.medicationId) },
                  })
                }
              >
                <Text style={styles.visualCheckButtonText}>
                  📷 Open Visual Pill Check
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.actionButton,
                  styles.takenButton,
                  savingDoseId !== null && styles.disabledButton,
                ]}
                disabled={savingDoseId !== null}
                onPress={() => confirmResponse(dose, "Taken")}
              >
                <Text style={styles.takenButtonText}>
                  {savingDoseId === dose.id ? "Saving..." : "I Already Took It"}
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.actionButton,
                  styles.missedButton,
                  savingDoseId !== null && styles.disabledButton,
                ]}
                disabled={savingDoseId !== null}
                onPress={() => confirmResponse(dose, "Missed")}
              >
                <Text style={styles.missedButtonText}>I Didn't Take It</Text>
              </Pressable>

              <Pressable
                style={styles.laterButton}
                disabled={savingDoseId !== null}
                onPress={() => router.back()}
              >
                <Text style={styles.laterButtonText}>Remind Me Later</Text>
              </Pressable>
            </View>
          ))
        )}

        <Text style={styles.disclaimer}>
          TiMed records your responses for adherence tracking. Self-reported
          medication use is not proof of ingestion. If you missed a dose, follow
          your prescribed instructions or consult a qualified healthcare
          professional.
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

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },

  backButton: {
    minWidth: 65,
  },

  backText: {
    color: "#B7E8F7",
    fontSize: 16,
    fontWeight: "600",
  },

  headerTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
  },

  headerSpacer: {
    width: 65,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 50,
  },

  agentCard: {
    backgroundColor: "#B7E8F7",
    borderRadius: 18,
    padding: 20,
    marginBottom: 28,
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

  agentNote: {
    fontSize: 12,
    color: "#476985",
    marginTop: 12,
    fontStyle: "italic",
  },

  sectionTitle: {
    fontSize: 19,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 15,
  },

  doseCard: {
    backgroundColor: "#263968",
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
  },

  doseHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },

  medicationIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#435A91",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  pillEmoji: {
    fontSize: 23,
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

  statusBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#F5D5A5",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 15,
  },

  statusText: {
    color: "#583E18",
    fontSize: 11,
    fontWeight: "600",
  },

  question: {
    color: "#E3EAFF",
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 18,
  },

  actionButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },

  visualCheckButton: {
    backgroundColor: "#364F91",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#B7E8F7",
  },

  visualCheckButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },

  takenButton: {
    backgroundColor: "#B8F1DF",
  },

  takenButtonText: {
    color: "#173A43",
    fontSize: 14,
    fontWeight: "bold",
  },

  missedButton: {
    backgroundColor: "#F5B8C4",
  },

  missedButtonText: {
    color: "#5A2030",
    fontSize: 14,
    fontWeight: "bold",
  },

  laterButton: {
    alignItems: "center",
    paddingVertical: 12,
  },

  laterButtonText: {
    color: "#B7E8F7",
    fontSize: 13,
    fontWeight: "600",
  },

  disabledButton: {
    opacity: 0.5,
  },

  emptyCard: {
    backgroundColor: "#263968",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    gap: 12,
  },

  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
  },

  emptyText: {
    color: "#C5D0ED",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
  },

  successIcon: {
    color: "#B8F1DF",
    fontSize: 34,
    fontWeight: "bold",
  },

  retryButton: {
    backgroundColor: "#B7E8F7",
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },

  retryText: {
    color: "#173A70",
    fontWeight: "bold",
  },

  disclaimer: {
    color: "#A9B8D6",
    fontSize: 12,
    lineHeight: 19,
    marginTop: 20,
    textAlign: "center",
  },
});
