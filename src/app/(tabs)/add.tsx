import {
    CalendarDays,
    Check,
    ChevronLeft,
    ChevronRight,
    Clock3,
    Pill,
    Plus,
    Trash2,
    X,
} from "lucide-react-native";
import { useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
    deleteAllMedications,
    saveMedication,
} from "../../services/medicationService";

type MedicationType = "Tablet" | "Capsule" | "Liquid" | "Other";

type Frequency =
  | "Once Daily"
  | "Twice Daily"
  | "Three Times Daily"
  | "Every X Hours"
  | "Custom";

type DateField = "start" | "end";

const medicationTypes: MedicationType[] = [
  "Tablet",
  "Capsule",
  "Liquid",
  "Other",
];

const frequencies: Frequency[] = [
  "Once Daily",
  "Twice Daily",
  "Three Times Daily",
  "Every X Hours",
  "Custom",
];

const weekdays = ["S", "M", "T", "W", "T", "F", "S"];

// Convert a local date to YYYY-MM-DD.
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// Convert 24-hour time into minutes after midnight.
function timeToMinutes(time: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return null;
  }

  const [hours, minutes] = time.split(":").map(Number);

  return hours * 60 + minutes;
}

// Convert minutes after midnight into 24-hour time.
function minutesToTime(totalMinutes: number): string {
  const minutesInDay = 24 * 60;
  const normalized =
    ((totalMinutes % minutesInDay) + minutesInDay) % minutesInDay;

  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0",
  )}`;
}

// Show a friendlier AM/PM time label.
function displayTime(time: string): string {
  const minutes = timeToMinutes(time);

  if (minutes === null) {
    return "Invalid time";
  }

  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const hour12 = hour24 % 12 || 12;
  const period = hour24 >= 12 ? "PM" : "AM";

  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

// A dated reminder occurrence, including reminders after midnight.
type IntervalOccurrence = {
  date: string;
  time: string;
};

function localDateTime(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes);
}

// Show the first 24 hours of an interval schedule, stopping at the
// end of the selected end date (inclusive) when one is provided.
// The saved first reminder time + interval remain authoritative.
function generateIntervalPreview(
  startDate: string,
  endDate: string,
  firstTime: string,
  intervalHours: number,
): IntervalOccurrence[] {
  if (
    timeToMinutes(firstTime) === null ||
    !Number.isInteger(intervalHours) ||
    intervalHours < 1 ||
    intervalHours > 24 ||
    (endDate !== "" && endDate < startDate)
  ) {
    return [];
  }

  const first = localDateTime(startDate, firstTime).getTime();
  const intervalMs = intervalHours * 60 * 60 * 1000;
  const previewEnd = first + 24 * 60 * 60 * 1000;
  const lastAllowed = endDate
    ? localDateTime(endDate, "00:00").getTime() + 24 * 60 * 60 * 1000
    : Infinity;
  const endExclusive = Math.min(previewEnd, lastAllowed);
  const occurrences: IntervalOccurrence[] = [];

  for (
    let timestamp = first;
    timestamp < endExclusive;
    timestamp += intervalMs
  ) {
    const date = new Date(timestamp);
    occurrences.push({
      date: formatDate(date),
      time: `${String(date.getHours()).padStart(2, "0")}:${String(
        date.getMinutes(),
      ).padStart(2, "0")}`,
    });
  }

  return occurrences;
}

export default function AddMedicationScreen() {
  const [isSaving, setIsSaving] = useState(false);

  const [name, setName] = useState("");
  const [dosage, setDosage] = useState("");

  const [medicationType, setMedicationType] =
    useState<MedicationType>("Tablet");
  const [otherType, setOtherType] = useState("");

  const [frequency, setFrequency] = useState<Frequency>("Once Daily");

  const [reminderTimes, setReminderTimes] = useState<string[]>(["08:00"]);

  const [firstTime, setFirstTime] = useState("08:00");
  const [intervalHours, setIntervalHours] = useState("8");

  const [startDate, setStartDate] = useState(formatDate(new Date()));
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");

  // Calendar modal state
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [activeDateField, setActiveDateField] = useState<DateField>("start");
  const [calendarMonth, setCalendarMonth] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );

  const isIntervalMode = frequency === "Every X Hours";

  const intervalNumber = Number(intervalHours);

  const generatedOccurrences = generateIntervalPreview(
    startDate,
    endDate,
    firstTime,
    intervalNumber,
  );

  // For interval schedules the database stores a preview of the first
  // 24 hours, while firstReminderTime + intervalHours define recurrence.
  const currentTimes = isIntervalMode
    ? generatedOccurrences.map((occurrence) => occurrence.time)
    : reminderTimes;

  const handleFrequencyChange = (value: Frequency) => {
    setFrequency(value);

    switch (value) {
      case "Once Daily":
        setReminderTimes(["08:00"]);
        break;

      case "Twice Daily":
        setReminderTimes(["08:00", "20:00"]);
        break;

      case "Three Times Daily":
        setReminderTimes(["08:00", "14:00", "20:00"]);
        break;

      case "Custom":
        setReminderTimes(["08:00"]);
        break;

      case "Every X Hours":
        setFirstTime("08:00");
        setIntervalHours("8");
        break;
    }
  };

  const updateReminderTime = (index: number, value: string) => {
    setReminderTimes((previous) =>
      previous.map((time, i) => (i === index ? value : time)),
    );
  };

  const addReminderTime = () => {
    if (reminderTimes.length >= 24) {
      Alert.alert("Reminder Limit", "You can add up to 24 reminder times.");
      return;
    }

    setReminderTimes((previous) => [...previous, "12:00"]);
  };

  const removeReminderTime = (index: number) => {
    if (reminderTimes.length <= 1) {
      return;
    }

    setReminderTimes((previous) => previous.filter((_, i) => i !== index));
  };

  const openCalendar = (field: DateField) => {
    setActiveDateField(field);

    const value = field === "start" ? startDate : endDate;
    const date = value ? new Date(`${value}T12:00:00`) : new Date();

    setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setCalendarVisible(true);
  };

  const selectCalendarDate = (day: number) => {
    const selected = formatDate(
      new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day),
    );

    if (activeDateField === "start") {
      setStartDate(selected);

      // Clear the end date if it is now before the start date.
      if (endDate && endDate < selected) {
        setEndDate("");
      }
    } else {
      if (selected < startDate) {
        Alert.alert(
          "Invalid End Date",
          "The end date cannot be earlier than the start date.",
        );
        return;
      }

      setEndDate(selected);
    }

    setCalendarVisible(false);
  };

  const changeCalendarMonth = (offset: number) => {
    setCalendarMonth(
      (previous) =>
        new Date(previous.getFullYear(), previous.getMonth() + offset, 1),
    );
  };

  const calendarYear = calendarMonth.getFullYear();
  const calendarMonthIndex = calendarMonth.getMonth();

  const firstWeekday = new Date(calendarYear, calendarMonthIndex, 1).getDay();

  const daysInMonth = new Date(
    calendarYear,
    calendarMonthIndex + 1,
    0,
  ).getDate();

  const calendarCells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const calendarTitle = calendarMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const selectedCalendarValue =
    activeDateField === "start" ? startDate : endDate;

  const resetForm = () => {
    setName("");
    setDosage("");
    setMedicationType("Tablet");
    setOtherType("");
    setFrequency("Once Daily");
    setReminderTimes(["08:00"]);
    setFirstTime("08:00");
    setIntervalHours("8");
    setStartDate(formatDate(new Date()));
    setEndDate("");
    setNotes("");
  };

  // Temporary development utility for clearing test medications.
  const handleClearTestMedications = () => {
    Alert.alert(
      "Clear Test Medications",
      "Are you sure you want to permanently delete ALL saved medications and their reminders? This cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete All",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAllMedications();

              Alert.alert(
                "Test Data Cleared",
                "All saved medications and their reminders have been deleted.",
              );
            } catch (error) {
              console.error("Failed to clear medications:", error);

              Alert.alert(
                "Deletion Failed",
                "Unable to clear test medications. Please try again.",
              );
            }
          },
        },
      ],
    );
  };

  const handleSave = async () => {
    if (isSaving) return;

    if (!name.trim() || !dosage.trim()) {
      Alert.alert(
        "Missing Information",
        "Please enter the medication name and dosage.",
      );
      return;
    }

    if (medicationType === "Other" && !otherType.trim()) {
      Alert.alert(
        "Missing Medication Type",
        "Please specify the medication type.",
      );
      return;
    }

    if (
      isIntervalMode &&
      (!Number.isInteger(intervalNumber) ||
        intervalNumber < 1 ||
        intervalNumber > 24)
    ) {
      Alert.alert(
        "Invalid Interval",
        "Enter a whole number of hours from 1 to 24.",
      );
      return;
    }

    if (currentTimes.length === 0) {
      Alert.alert(
        "Missing Reminders",
        "Please provide at least one valid reminder time.",
      );
      return;
    }

    if (currentTimes.some((time) => timeToMinutes(time) === null)) {
      Alert.alert(
        "Invalid Reminder Time",
        "Please use HH:MM format, such as 08:00 or 20:30.",
      );
      return;
    }

    if (new Set(currentTimes).size !== currentTimes.length) {
      Alert.alert(
        "Duplicate Reminders",
        "Please make sure each reminder time is different.",
      );
      return;
    }

    if (endDate && endDate < startDate) {
      Alert.alert(
        "Invalid Date Range",
        "The end date cannot be earlier than the start date.",
      );
      return;
    }

    setIsSaving(true);

    try {
      const savedId = await saveMedication({
        name: name.trim(),
        dosage: dosage.trim(),
        medicationType:
          medicationType === "Other" ? otherType.trim() : medicationType,
        frequency,
        intervalHours: isIntervalMode ? intervalNumber : null,
        firstReminderTime: isIntervalMode ? firstTime : null,
        reminderTimes: [...currentTimes],
        startDate,
        endDate: endDate || null,
        notes: notes.trim() || null,
      });

      Alert.alert(
        "Medication Saved",
        isIntervalMode
          ? `${name.trim()} was saved to TiMed!\n\nMedication ID: ${savedId}\nEvery ${intervalNumber} hour(s), starting ${startDate} at ${displayTime(firstTime)}.\nEnd date: ${endDate || "Not set"}\n\nPreview:\n${generatedOccurrences.map((item) => `${item.date} - ${displayTime(item.time)}`).join("\n")}`
          : `${name.trim()} was successfully saved to TiMed!\n\nMedication ID: ${savedId}\nReminders: ${currentTimes.map(displayTime).join(", ")}`,
        [{ text: "OK", onPress: resetForm }],
      );
    } catch (error) {
      console.error("Failed to save medication:", error);
      Alert.alert(
        "Save Failed",
        error instanceof Error
          ? error.message
          : "Something went wrong while saving the medication.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar barStyle="light-content" />

      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Add Medication</Text>
              <Text style={styles.subtitle}>
                Set up a new medication schedule
              </Text>
            </View>

            <View style={styles.headerIcon}>
              <Plus size={24} color="#FFFFFF" />
            </View>
          </View>

          {/* Information Card */}
          <View style={styles.infoCard}>
            <Pill size={24} color="#173A70" />

            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>Medication Details</Text>
              <Text style={styles.infoDescription}>
                Enter the medication information and schedule according to your
                prescribed instructions.
              </Text>
            </View>
          </View>

          {/* Medication Name */}
          <Text style={styles.label}>
            Medication Name
            <Text style={styles.required}> *</Text>
          </Text>

          <TextInput
            style={styles.input}
            placeholder="e.g. Medication name"
            placeholderTextColor="#899CC7"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />

          {/* Dosage */}
          <Text style={styles.label}>
            Dosage
            <Text style={styles.required}> *</Text>
          </Text>

          <TextInput
            style={styles.input}
            placeholder="e.g. 500 mg"
            placeholderTextColor="#899CC7"
            value={dosage}
            onChangeText={setDosage}
          />

          {/* Medication Type */}
          <Text style={styles.label}>Medication Type</Text>

          <View style={styles.optionGrid}>
            {medicationTypes.map((type) => (
              <Pressable
                key={type}
                onPress={() => setMedicationType(type)}
                style={[
                  styles.optionButton,
                  medicationType === type && styles.selectedOption,
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    medicationType === type && styles.selectedOptionText,
                  ]}
                >
                  {type}
                </Text>

                {medicationType === type && <Check size={15} color="#172448" />}
              </Pressable>
            ))}
          </View>

          {medicationType === "Other" && (
            <>
              <Text style={styles.label}>
                Specify Medication Type
                <Text style={styles.required}> *</Text>
              </Text>

              <TextInput
                style={styles.input}
                placeholder="e.g. Cream, inhaler, eye drops"
                placeholderTextColor="#899CC7"
                value={otherType}
                onChangeText={setOtherType}
              />
            </>
          )}

          {/* Frequency */}
          <Text style={styles.label}>Frequency</Text>

          <View style={styles.optionGrid}>
            {frequencies.map((item) => (
              <Pressable
                key={item}
                onPress={() => handleFrequencyChange(item)}
                style={[
                  styles.optionButton,
                  frequency === item && styles.selectedOption,
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    frequency === item && styles.selectedOptionText,
                  ]}
                >
                  {item}
                </Text>

                {frequency === item && <Check size={15} color="#172448" />}
              </Pressable>
            ))}
          </View>

          {/* Reminder Section */}
          <View style={styles.sectionHeader}>
            <Clock3 size={20} color="#B7E8F7" />
            <Text style={styles.sectionTitle}>Reminder Times</Text>
          </View>

          {isIntervalMode ? (
            <>
              {/* Every X Hours */}
              <Text style={styles.label}>Interval (Hours)</Text>

              <TextInput
                style={styles.input}
                placeholder="e.g. 8"
                placeholderTextColor="#899CC7"
                value={intervalHours}
                onChangeText={setIntervalHours}
                keyboardType="number-pad"
                maxLength={2}
              />

              <Text style={styles.label}>First Reminder Time</Text>

              <View style={styles.timeInputRow}>
                <Clock3 size={20} color="#AFC2EA" />

                <TextInput
                  style={styles.timeInput}
                  value={firstTime}
                  onChangeText={setFirstTime}
                  placeholder="08:00"
                  placeholderTextColor="#899CC7"
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                />
              </View>

              <Text style={styles.helperText}>
                Use 24-hour format (HH:MM). Reminders are calculated
                automatically.
              </Text>

              <View style={styles.previewCard}>
                <Text style={styles.previewTitle}>
                  Generated Reminder Schedule
                </Text>

                {generatedOccurrences.length > 0 ? (
                  generatedOccurrences.map((occurrence, index) => (
                    <View
                      key={`${occurrence.date}-${occurrence.time}`}
                      style={styles.previewRow}
                    >
                      <View style={styles.previewNumber}>
                        <Text style={styles.previewNumberText}>
                          {index + 1}
                        </Text>
                      </View>

                      <View>
                        <Text style={styles.previewTime}>
                          {displayTime(occurrence.time)}
                        </Text>
                        <Text style={styles.previewDate}>
                          {occurrence.date}
                        </Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.previewEmpty}>
                    Enter a valid interval and starting time to generate
                    reminders.
                  </Text>
                )}
              </View>

              <Text style={styles.helperText}>
                Preview shows up to the first 24 hours and stops at the selected
                end date. Longer schedules continue at the chosen interval,
                including across midnight. Use only your prescribed interval;
                this preview does not verify medical suitability.
              </Text>
            </>
          ) : (
            <>
              {/* Editable Reminder Times */}
              {reminderTimes.map((time, index) => (
                <View key={index} style={styles.reminderRow}>
                  <View style={styles.reminderInputBox}>
                    <Clock3 size={19} color="#AFC2EA" />

                    <View style={styles.reminderDetails}>
                      <Text style={styles.reminderLabel}>
                        Reminder {index + 1}
                      </Text>

                      <TextInput
                        style={styles.reminderInput}
                        value={time}
                        onChangeText={(value) =>
                          updateReminderTime(index, value)
                        }
                        placeholder="HH:MM"
                        placeholderTextColor="#899CC7"
                        keyboardType="numbers-and-punctuation"
                        maxLength={5}
                      />
                    </View>
                  </View>

                  {frequency === "Custom" && reminderTimes.length > 1 && (
                    <Pressable
                      onPress={() => removeReminderTime(index)}
                      style={styles.removeButton}
                    >
                      <Trash2 size={20} color="#F5B8C4" />
                    </Pressable>
                  )}
                </View>
              ))}

              {frequency === "Custom" && (
                <Pressable
                  style={styles.addTimeButton}
                  onPress={addReminderTime}
                >
                  <Plus size={18} color="#B7E8F7" />
                  <Text style={styles.addTimeText}>Add Another Time</Text>
                </Pressable>
              )}

              <Text style={styles.helperText}>
                Enter times in 24-hour format. Choose times according to your
                prescribed schedule.
              </Text>
            </>
          )}

          {/* Start Date */}
          <Text style={styles.label}>Start Date</Text>

          <Pressable
            style={styles.dateButton}
            onPress={() => openCalendar("start")}
          >
            <CalendarDays size={20} color="#AFC2EA" />

            <Text style={styles.dateButtonText}>{startDate}</Text>
          </Pressable>

          {/* End Date */}
          <Text style={styles.label}>
            End Date
            <Text style={styles.optional}> (Optional)</Text>
          </Text>

          <Pressable
            style={styles.dateButton}
            onPress={() => openCalendar("end")}
          >
            <CalendarDays size={20} color="#AFC2EA" />

            <Text
              style={[
                styles.dateButtonText,
                !endDate && styles.placeholderText,
              ]}
            >
              {endDate || "Select an end date"}
            </Text>
          </Pressable>

          {endDate !== "" && (
            <Pressable
              style={styles.clearDateButton}
              onPress={() => setEndDate("")}
            >
              <X size={15} color="#F5B8C4" />
              <Text style={styles.clearDateText}>Remove End Date</Text>
            </Pressable>
          )}

          {/* Notes */}
          <Text style={styles.label}>
            Additional Notes
            <Text style={styles.optional}> (Optional)</Text>
          </Text>

          <TextInput
            style={[styles.input, styles.notesInput]}
            placeholder="e.g. Take after meals"
            placeholderTextColor="#899CC7"
            value={notes}
            onChangeText={setNotes}
            multiline
            textAlignVertical="top"
          />

          {/* Save */}
          <Pressable
            style={[styles.saveButton, isSaving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={isSaving}
          >
            <Plus size={20} color="#172448" />

            <Text style={styles.saveButtonText}>
              {isSaving ? "Saving..." : "Save Medication"}
            </Text>
          </Pressable>

          <Text style={styles.formNote}>
            Medication information is stored locally on this device. Reminder
            notifications and medication verification will be implemented later.
          </Text>

          {/* Temporary development-only cleanup control */}
          <Pressable
            style={[styles.clearTestButton, isSaving && { opacity: 0.6 }]}
            onPress={handleClearTestMedications}
            disabled={isSaving}
          >
            <Trash2 size={18} color="#F5B8C4" />
            <Text style={styles.clearTestButtonText}>
              Clear Test Medications
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Calendar Picker Modal */}
      <Modal
        visible={calendarVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCalendarVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.calendarModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {activeDateField === "start"
                  ? "Select Start Date"
                  : "Select End Date"}
              </Text>

              <Pressable onPress={() => setCalendarVisible(false)}>
                <X size={23} color="#FFFFFF" />
              </Pressable>
            </View>

            <View style={styles.calendarMonthHeader}>
              <Pressable
                onPress={() => changeCalendarMonth(-1)}
                style={styles.calendarArrow}
              >
                <ChevronLeft size={24} color="#FFFFFF" />
              </Pressable>

              <Text style={styles.calendarMonthTitle}>{calendarTitle}</Text>

              <Pressable
                onPress={() => changeCalendarMonth(1)}
                style={styles.calendarArrow}
              >
                <ChevronRight size={24} color="#FFFFFF" />
              </Pressable>
            </View>

            <View style={styles.calendarGrid}>
              {weekdays.map((day, index) => (
                <View key={`weekday-${index}`} style={styles.calendarCell}>
                  <Text style={styles.weekdayText}>{day}</Text>
                </View>
              ))}

              {calendarCells.map((day, index) => {
                const dateValue =
                  day !== null
                    ? formatDate(
                        new Date(calendarYear, calendarMonthIndex, day),
                      )
                    : "";

                const isSelected = dateValue === selectedCalendarValue;

                const isDisabled =
                  activeDateField === "end" &&
                  day !== null &&
                  dateValue < startDate;

                return (
                  <View key={`date-${index}`} style={styles.calendarCell}>
                    {day !== null && (
                      <Pressable
                        disabled={isDisabled}
                        onPress={() => selectCalendarDate(day)}
                        style={[
                          styles.calendarDay,
                          isSelected && styles.calendarSelectedDay,
                        ]}
                      >
                        <Text
                          style={[
                            styles.calendarDayText,
                            isSelected && styles.calendarSelectedText,
                            isDisabled && styles.calendarDisabledText,
                          ]}
                        >
                          {day}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>

            <Text style={styles.calendarHint}>
              {activeDateField === "end"
                ? "Choose a date on or after the start date."
                : "Choose the date when the schedule begins."}
            </Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#101B3D",
  },

  keyboardContainer: {
    flex: 1,
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
    marginBottom: 25,
  },

  headerText: {
    flex: 1,
  },

  title: {
    fontSize: 30,
    fontWeight: "bold",
    color: "#FFFFFF",
  },

  subtitle: {
    fontSize: 14,
    color: "#C0CBE9",
    marginTop: 7,
  },

  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#364F91",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 10,
  },

  infoCard: {
    backgroundColor: "#B7E8F7",
    borderRadius: 18,
    padding: 18,
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 26,
  },

  infoContent: {
    flex: 1,
    marginLeft: 12,
  },

  infoTitle: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#173A70",
    marginBottom: 6,
  },

  infoDescription: {
    fontSize: 13,
    lineHeight: 19,
    color: "#21436B",
  },

  label: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 10,
    marginTop: 8,
  },

  required: {
    color: "#F3A2B5",
  },

  optional: {
    color: "#A9B8D6",
    fontSize: 12,
    fontWeight: "400",
  },

  input: {
    backgroundColor: "#263968",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
    color: "#FFFFFF",
    fontSize: 15,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#3B5285",
  },

  optionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 22,
  },

  optionButton: {
    backgroundColor: "#263968",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#3B5285",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  selectedOption: {
    backgroundColor: "#B7E8F7",
    borderColor: "#B7E8F7",
  },

  optionText: {
    color: "#D7E1FA",
    fontSize: 13,
    fontWeight: "500",
  },

  selectedOptionText: {
    color: "#172448",
    fontWeight: "bold",
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 15,
    marginTop: 8,
  },

  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "bold",
  },

  reminderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 10,
  },

  reminderInputBox: {
    flex: 1,
    backgroundColor: "#263968",
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#3B5285",
  },

  reminderDetails: {
    flex: 1,
    marginLeft: 12,
  },

  reminderLabel: {
    color: "#AFC2EA",
    fontSize: 12,
    marginBottom: 3,
  },

  reminderInput: {
    color: "#FFFFFF",
    fontSize: 16,
    paddingVertical: 4,
  },

  removeButton: {
    backgroundColor: "#493556",
    padding: 15,
    borderRadius: 12,
  },

  addTimeButton: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#8BD8F7",
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },

  addTimeText: {
    color: "#B7E8F7",
    fontSize: 14,
    fontWeight: "600",
  },

  timeInputRow: {
    backgroundColor: "#263968",
    borderRadius: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#3B5285",
    marginBottom: 10,
  },

  timeInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 15,
  },

  helperText: {
    color: "#A9B8D6",
    fontSize: 12,
    lineHeight: 19,
    marginBottom: 20,
  },

  previewCard: {
    backgroundColor: "#263968",
    borderRadius: 16,
    padding: 17,
    marginBottom: 12,
  },

  previewTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "bold",
    marginBottom: 14,
  },

  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 12,
  },

  previewNumber: {
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: "#B7E8F7",
    alignItems: "center",
    justifyContent: "center",
  },

  previewNumberText: {
    color: "#173A70",
    fontSize: 12,
    fontWeight: "bold",
  },

  previewTime: {
    color: "#FFFFFF",
    fontSize: 15,
  },

  previewDate: {
    color: "#AFC2EA",
    fontSize: 12,
    marginTop: 3,
  },

  previewEmpty: {
    color: "#C0CBE9",
    fontSize: 13,
    lineHeight: 20,
  },

  dateButton: {
    backgroundColor: "#263968",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#3B5285",
    marginBottom: 18,
  },

  dateButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
  },

  placeholderText: {
    color: "#899CC7",
  },

  clearDateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 18,
  },

  clearDateText: {
    color: "#F5B8C4",
    fontSize: 13,
  },

  notesInput: {
    height: 110,
    paddingTop: 15,
  },

  saveButton: {
    backgroundColor: "#B7E8F7",
    borderRadius: 16,
    paddingVertical: 17,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
  },

  saveButtonText: {
    color: "#172448",
    fontSize: 17,
    fontWeight: "bold",
  },

  formNote: {
    color: "#A9B8D6",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 16,
  },

  clearTestButton: {
    borderWidth: 1,
    borderColor: "#F5B8C4",
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 22,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },

  clearTestButtonText: {
    color: "#F5B8C4",
    fontSize: 14,
    fontWeight: "600",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },

  calendarModal: {
    backgroundColor: "#263968",
    borderRadius: 22,
    padding: 18,
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },

  modalTitle: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "bold",
  },

  calendarMonthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 15,
  },

  calendarMonthTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "bold",
  },

  calendarArrow: {
    padding: 6,
  },

  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },

  calendarCell: {
    width: "14.2857%",
    height: 43,
    justifyContent: "center",
    alignItems: "center",
  },

  weekdayText: {
    color: "#AFC2EA",
    fontSize: 13,
    fontWeight: "600",
  },

  calendarDay: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },

  calendarSelectedDay: {
    backgroundColor: "#F3A2B5",
  },

  calendarDayText: {
    color: "#FFFFFF",
    fontSize: 14,
  },

  calendarSelectedText: {
    color: "#172448",
    fontWeight: "bold",
  },

  calendarDisabledText: {
    color: "#66769A",
  },

  calendarHint: {
    color: "#AFC2EA",
    fontSize: 12,
    textAlign: "center",
    marginTop: 15,
  },
});
