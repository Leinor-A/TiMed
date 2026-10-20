import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  getAllMedications,
  type StoredMedication,
} from "../services/medicationService";
import {
  analyzePillImage,
  type VisionPrediction,
} from "../services/visionService";

type Comparison = { heading: string; message: string };

function getComparison(
  medication: StoredMedication,
  prediction: VisionPrediction,
): Comparison {
  const name = medication.name.toLowerCase().trim();
  const dosage = medication.dosage.toLowerCase().replace(/\s/g, "");
  const predicted = prediction.predicted_class.toLowerCase();
  const classes = [
    { keyword: "amoxicillin", strength: "250mg", label: "Amoxicillin 250 mg" },
    { keyword: "hydroxyzine", strength: "100mg", label: "Hydroxyzine 100 mg" },
  ];
  const selectedClass = classes.find(
    (item) => name.includes(item.keyword) && dosage.includes(item.strength),
  );

  if (!selectedClass) {
    return {
      heading: "Selected medication not supported",
      message:
        "This experimental model includes only Amoxicillin 250 mg and Hydroxyzine 100 mg. It cannot compare the selected medication.",
    };
  }

  if (
    predicted.includes(selectedClass.keyword) &&
    predicted.includes(selectedClass.strength)
  ) {
    return {
      heading: "Experimental appearance resemblance",
      message: `The photograph resembles the model's ${selectedClass.label} class. This is not medication verification.`,
    };
  }

  return {
    heading: "Different experimental class predicted",
    message:
      "The model assigned this photograph to a different experimental class. This does not establish the photograph's actual medication identity.",
  };
}

export default function VisualCheckScreen() {
  const { medicationId } = useLocalSearchParams<{ medicationId?: string }>();
  const [medications, setMedications] = useState<StoredMedication[]>([]);
  const [selectedMedication, setSelectedMedication] =
    useState<StoredMedication | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [result, setResult] = useState<VisionPrediction | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMedications, setLoadingMedications] = useState(true);

  useEffect(() => {
    let active = true;
    setLoadingMedications(true);

    getAllMedications()
      .then((savedMedications) => {
        if (!active) return;
        setMedications(savedMedications);

        if (medicationId) {
          const matchingMedication = savedMedications.find(
            (medication) => String(medication.id) === medicationId,
          );
          setSelectedMedication(matchingMedication ?? null);
          setImageUri(null);
          setResult(null);
        }
      })
      .catch((error) => {
        console.error("Failed to load medications:", error);
        if (active) {
          Alert.alert("Unable to Load", "Could not load saved medications.");
        }
      })
      .finally(() => {
        if (active) setLoadingMedications(false);
      });

    return () => {
      active = false;
    };
  }, [medicationId]);

  const chooseImage = async (useCamera: boolean) => {
    if (loading) return;

    try {
      const permission = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Permission Required",
          useCamera
            ? "Please allow camera access to take a photograph."
            : "Please allow photo library access to select a photograph.",
        );
        return;
      }

      const pickerResult = useCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            allowsEditing: false,
            quality: 0.7,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: false,
            quality: 0.7,
          });

      if (!pickerResult.canceled && pickerResult.assets.length > 0) {
        setImageUri(pickerResult.assets[0].uri);
        setResult(null);
      }
    } catch (error) {
      console.error("Image selection failed:", error);
      Alert.alert("Unable to Open", "Could not open the camera or photo library.");
    }
  };

  const analyzeImage = async () => {
    if (loading) return;
    if (!selectedMedication) {
      Alert.alert("Select Medication", "Please select a medication first.");
      return;
    }
    if (!imageUri) {
      Alert.alert("No Photograph", "Please take or select a photograph.");
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const prediction = await analyzePillImage(imageUri);
      setResult(prediction);
    } catch (error) {
      console.error("Vision API error:", error);
      Alert.alert(
        "Unable to Analyze",
        error instanceof Error
          ? error.message
          : "Could not connect to the TiMed vision server.",
      );
    } finally {
      setLoading(false);
    }
  };

  const comparison =
    result && selectedMedication
      ? getComparison(selectedMedication, result)
      : null;
  const canAnalyze = !loading && !!selectedMedication && !!imageUri;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
        >
          <Text style={styles.backText}>← Back</Text>
        </Pressable>

        <Text style={styles.title}>Visual Pill Check</Text>
        <Text style={styles.subtitle}>
          Compare a photograph with TiMed's experimental appearance-classification model.
        </Text>

        <View style={styles.introCard}>
          <Text style={styles.introEmoji}>📷</Text>
          <View style={styles.introContent}>
            <Text style={styles.introTitle}>Photo-Based Analysis</Text>
            <Text style={styles.introDescription}>
              Select a medication, capture a photograph, and review the experimental output.
            </Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View style={styles.stepCircle}><Text style={styles.stepNumber}>1</Text></View>
          <Text style={styles.sectionTitle}>Select Medication</Text>
        </View>
        <Text style={styles.sectionDescription}>
          Choose a saved medication. When opened from Agent Follow-Up, the relevant medication is preselected.
        </Text>

        {loadingMedications ? (
          <View style={styles.emptyCard}>
            <ActivityIndicator color="#B7E8F7" />
            <Text style={styles.emptyText}>Loading medications...</Text>
          </View>
        ) : medications.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No medications saved yet.</Text>
            <Text style={styles.emptyHint}>Add a medication before using this feature.</Text>
          </View>
        ) : (
          medications.map((medication) => {
            const isSelected = selectedMedication?.id === medication.id;
            return (
              <Pressable
                key={medication.id}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                style={[styles.medicationCard, isSelected && styles.selectedCard]}
                disabled={loading}
                onPress={() => {
                  setSelectedMedication(medication);
                  setResult(null);
                }}
              >
                <View style={styles.medicationIcon}>
                  <Text style={styles.pillEmoji}>💊</Text>
                </View>
                <View style={styles.medicationDetails}>
                  <Text style={styles.medicationName}>{medication.name}</Text>
                  <Text style={styles.medicationDosage}>{medication.dosage}</Text>
                </View>
                <View style={[styles.selectionCircle, isSelected && styles.selectionCircleActive]}>
                  {isSelected && <Text style={styles.checkmark}>✓</Text>}
                </View>
              </Pressable>
            );
          })
        )}

        <View style={styles.sectionHeader}>
          <View style={styles.stepCircle}><Text style={styles.stepNumber}>2</Text></View>
          <Text style={styles.sectionTitle}>Capture Photograph</Text>
        </View>
        <Text style={styles.sectionDescription}>
          Use a well-lit photograph with the pill visible against a plain background.
        </Text>
        <View style={styles.photoCard}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.photoPreview} resizeMode="contain" />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.cameraEmoji}>📸</Text>
              <Text style={styles.placeholderTitle}>No photograph selected</Text>
              <Text style={styles.placeholderSubtitle}>
                Take a photo or choose one from your library
              </Text>
            </View>
          )}
          {imageUri && (
            <Text style={styles.photoSelectedText}>✓ Photograph selected</Text>
          )}
        </View>

        <View style={styles.buttonRow}>
          <Pressable style={styles.photoButton} disabled={loading} onPress={() => chooseImage(true)}>
            <Text style={styles.photoButtonIcon}>📷</Text>
            <Text style={styles.photoButtonText}>Take Photo</Text>
          </Pressable>
          <Pressable style={styles.photoButton} disabled={loading} onPress={() => chooseImage(false)}>
            <Text style={styles.photoButtonIcon}>🖼️</Text>
            <Text style={styles.photoButtonText}>Choose Photo</Text>
          </Pressable>
        </View>

        <View style={styles.sectionHeader}>
          <View style={styles.stepCircle}><Text style={styles.stepNumber}>3</Text></View>
          <Text style={styles.sectionTitle}>Analyze Photograph</Text>
        </View>
        <Text style={styles.sectionDescription}>
          Submit the photograph to TiMed's experimental classification model.
        </Text>
        <Pressable
          style={[styles.analyzeButton, !canAnalyze && styles.disabledButton]}
          disabled={!canAnalyze}
          onPress={analyzeImage}
          accessibilityRole="button"
        >
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#173A70" />
              <Text style={styles.analyzeButtonText}>Analyzing photograph...</Text>
            </View>
          ) : (
            <Text style={styles.analyzeButtonText}>✦ Analyze Photograph</Text>
          )}
        </Pressable>

        {result && comparison && (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>✦ Experimental Analysis Result</Text>
            <View style={styles.resultDivider} />
            <Text style={styles.resultHeading}>{comparison.heading}</Text>
            <Text style={styles.resultMessage}>{comparison.message}</Text>
            <View style={styles.modelInfoCard}>
              <Text style={styles.modelInfoLabel}>MODEL CLASS</Text>
              <Text style={styles.modelInfoValue}>
                {result.predicted_class.replace(/_/g, " ")}
              </Text>
              <Text style={styles.modelInfoLabel}>MODEL SCORE</Text>
              <Text style={styles.modelScore}>
                {(result.model_score * 100).toFixed(1)}%
              </Text>
              <Text style={styles.scoreNote}>
                Not calibrated confidence; does not indicate medication safety.
              </Text>
            </View>
            <View style={styles.warningCard}>
              <Text style={styles.warningTitle}>Important Limitation</Text>
              <Text style={styles.warningText}>{result.disclaimer}</Text>
            </View>
          </View>
        )}

        <View style={styles.footerCard}>
          <Text style={styles.footerTitle}>About This Feature</Text>
          <Text style={styles.footerText}>
            TiMed's experimental visual analysis cannot confirm medication identity,
            strength, safety, or ingestion. Do not use its output to decide whether
            to take a medication. This analysis does not record a dose as Taken.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#101B3D" },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 120 },
  backButton: { alignSelf: "flex-start", marginBottom: 24, paddingVertical: 6 },
  backText: { color: "#B7E8F7", fontSize: 14, fontWeight: "600" },
  title: { color: "#FFFFFF", fontSize: 30, fontWeight: "700" },
  subtitle: { color: "#C0CBE9", fontSize: 14, lineHeight: 22, marginTop: 10, marginBottom: 24 },
  introCard: { backgroundColor: "#263968", borderRadius: 18, padding: 18, flexDirection: "row", alignItems: "center", marginBottom: 14 },
  introEmoji: { fontSize: 28, marginRight: 14 },
  introContent: { flex: 1 },
  introTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "700", marginBottom: 5 },
  introDescription: { color: "#C5D0ED", fontSize: 12, lineHeight: 19 },
  sectionHeader: { flexDirection: "row", alignItems: "center", marginTop: 24, marginBottom: 8 },
  stepCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#B7E8F7", alignItems: "center", justifyContent: "center", marginRight: 11 },
  stepNumber: { color: "#173A70", fontWeight: "800", fontSize: 14 },
  sectionTitle: { color: "#FFFFFF", fontSize: 19, fontWeight: "700" },
  sectionDescription: { color: "#AEBEDE", fontSize: 13, lineHeight: 20, marginBottom: 15 },
  medicationCard: { backgroundColor: "#263968", borderRadius: 15, padding: 14, flexDirection: "row", alignItems: "center", marginBottom: 10, borderWidth: 1, borderColor: "#263968" },
  selectedCard: { backgroundColor: "#304B83", borderColor: "#B7E8F7" },
  medicationIcon: { width: 43, height: 43, borderRadius: 12, backgroundColor: "#435A91", alignItems: "center", justifyContent: "center", marginRight: 12 },
  pillEmoji: { fontSize: 22 },
  medicationDetails: { flex: 1 },
  medicationName: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  medicationDosage: { color: "#C5D0ED", fontSize: 12, marginTop: 5 },
  selectionCircle: { width: 23, height: 23, borderRadius: 12, borderWidth: 2, borderColor: "#8095C1", alignItems: "center", justifyContent: "center" },
  selectionCircleActive: { backgroundColor: "#B7E8F7", borderColor: "#B7E8F7" },
  checkmark: { color: "#173A70", fontWeight: "800", fontSize: 13 },
  emptyCard: { backgroundColor: "#263968", padding: 22, borderRadius: 15, alignItems: "center", gap: 10 },
  emptyText: { color: "#FFFFFF", fontSize: 14, textAlign: "center" },
  emptyHint: { color: "#C5D0ED", fontSize: 12, textAlign: "center" },
  photoCard: { backgroundColor: "#263968", borderRadius: 18, overflow: "hidden" },
  photoPlaceholder: { height: 220, alignItems: "center", justifyContent: "center", padding: 20 },
  cameraEmoji: { fontSize: 40, marginBottom: 12 },
  placeholderTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  placeholderSubtitle: { color: "#C5D0ED", fontSize: 12, textAlign: "center", marginTop: 8, lineHeight: 19 },
  photoPreview: { width: "100%", height: 240, backgroundColor: "#1A2A51" },
  photoSelectedText: { color: "#B7E8F7", fontSize: 12, fontWeight: "600", textAlign: "center", padding: 12 },
  buttonRow: { flexDirection: "row", gap: 12, marginTop: 14 },
  photoButton: { flex: 1, backgroundColor: "#364F91", borderRadius: 13, paddingVertical: 15, alignItems: "center", justifyContent: "center", gap: 5 },
  photoButtonIcon: { fontSize: 23 },
  photoButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  analyzeButton: { backgroundColor: "#B7E8F7", padding: 17, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 3 },
  disabledButton: { opacity: 0.45 },
  analyzeButtonText: { color: "#173A70", fontSize: 15, fontWeight: "800" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  resultCard: { backgroundColor: "#263968", borderRadius: 18, padding: 19, marginTop: 26 },
  resultTitle: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  resultDivider: { height: 1, backgroundColor: "#435A91", marginVertical: 16 },
  resultHeading: { color: "#B7E8F7", fontSize: 16, fontWeight: "700", marginBottom: 9 },
  resultMessage: { color: "#E0E8F9", fontSize: 13, lineHeight: 21 },
  modelInfoCard: { backgroundColor: "#1A2A51", borderRadius: 13, padding: 16, marginTop: 18 },
  modelInfoLabel: { color: "#AEBEDE", fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 7 },
  modelInfoValue: { color: "#FFFFFF", fontSize: 16, fontWeight: "700", marginBottom: 19 },
  modelScore: { color: "#B7E8F7", fontSize: 27, fontWeight: "800" },
  scoreNote: { color: "#AEBEDE", fontSize: 11, lineHeight: 18, marginTop: 6 },
  warningCard: { backgroundColor: "#364F91", borderRadius: 12, padding: 14, marginTop: 15 },
  warningTitle: { color: "#FFFFFF", fontSize: 13, fontWeight: "700", marginBottom: 7 },
  warningText: { color: "#D2DDF7", fontSize: 12, lineHeight: 19 },
  footerCard: { marginTop: 24, padding: 17, borderRadius: 14, borderWidth: 1, borderColor: "#435A91" },
  footerTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", marginBottom: 8 },
  footerText: { color: "#AEBEDE", fontSize: 12, lineHeight: 20 },
});
