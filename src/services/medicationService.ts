import { db, initializeDatabase } from "../database/database";

import {
    cancelMedicationNotifications,
    debugScheduledNotifications,
    scheduleMedicationNotifications,
} from "./notificationService";

// Supported medication frequencies.
export type MedicationFrequency =
  | "Once Daily"
  | "Twice Daily"
  | "Three Times Daily"
  | "Every X Hours"
  | "Custom";

// Information required when saving a medication.
export type NewMedication = {
  name: string;
  dosage: string;
  medicationType: string;
  frequency: MedicationFrequency;
  intervalHours: number | null;
  firstReminderTime: string | null;
  reminderTimes: string[];
  startDate: string;
  endDate: string | null;
  notes: string | null;
};

// Medication record retrieved from SQLite.
export type StoredMedication = NewMedication & {
  id: number;
  createdAt: string;
};

// Raw SQLite medication row.
type MedicationRow = {
  id: number;
  name: string;
  dosage: string;
  medication_type: string;
  frequency: MedicationFrequency;
  interval_hours: number | null;
  first_reminder_time: string | null;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  created_at: string;
};

// Raw SQLite reminder row.
type ReminderRow = {
  medication_id: number;
  reminder_time: string;
};

// Share one initialization promise across operations.
let databaseReadyPromise: Promise<void> | null = null;

function ensureDatabaseReady(): Promise<void> {
  if (!databaseReadyPromise) {
    databaseReadyPromise = initializeDatabase().catch((error) => {
      databaseReadyPromise = null;
      throw error;
    });
  }

  return databaseReadyPromise;
}

// Validate a reminder time in 24-hour format.
function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

// Save one medication and all its reminder times.
export async function saveMedication(
  medication: NewMedication,
): Promise<number> {
  await ensureDatabaseReady();

  if (!medication.name.trim()) {
    throw new Error("Medication name is required.");
  }

  if (!medication.dosage.trim()) {
    throw new Error("Medication dosage is required.");
  }

  if (medication.reminderTimes.length === 0) {
    throw new Error("At least one reminder time is required.");
  }

  if (medication.reminderTimes.some((time) => !isValidTime(time))) {
    throw new Error("One or more reminder times are invalid.");
  }

  if (
    new Set(medication.reminderTimes).size !== medication.reminderTimes.length
  ) {
    throw new Error("Reminder times must be unique.");
  }

  if (medication.endDate && medication.endDate < medication.startDate) {
    throw new Error("End date cannot be earlier than start date.");
  }

  if (medication.frequency === "Every X Hours") {
    if (
      medication.intervalHours === null ||
      !Number.isInteger(medication.intervalHours) ||
      medication.intervalHours < 1 ||
      medication.intervalHours > 24 ||
      !medication.firstReminderTime ||
      !isValidTime(medication.firstReminderTime)
    ) {
      throw new Error("A valid interval and first reminder time are required.");
    }
  }

  // Save medication and reminder times in one transaction.
  let savedId = 0;

  await db.withExclusiveTransactionAsync(async (tx) => {
    const result = await tx.runAsync(
      `INSERT INTO medications (
        name,
        dosage,
        medication_type,
        frequency,
        interval_hours,
        first_reminder_time,
        start_date,
        end_date,
        notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        medication.name.trim(),
        medication.dosage.trim(),
        medication.medicationType.trim(),
        medication.frequency,
        medication.intervalHours,
        medication.firstReminderTime,
        medication.startDate,
        medication.endDate,
        medication.notes,
      ],
    );

    savedId = result.lastInsertRowId;

    for (const reminderTime of medication.reminderTimes) {
      await tx.runAsync(
        `INSERT INTO medication_reminders (
          medication_id,
          reminder_time
        ) VALUES (?, ?)`,
        [savedId, reminderTime],
      );
    }
  });

  // Retrieve the newly saved medication.
  const savedMedication = await getMedicationById(savedId);

  if (savedMedication) {
    try {
      const scheduledCount =
        await scheduleMedicationNotifications(savedMedication);

      console.log(`[TiMed] Saved medication ID: ${savedId}`);

      console.log(`[TiMed] Notifications scheduled: ${scheduledCount}`);

      // Print all pending notifications for debugging.
      await debugScheduledNotifications();
    } catch (error) {
      // Keep the medication saved even if scheduling fails.
      console.warn(
        "[TiMed] Medication saved, but notification scheduling failed:",
        error,
      );
    }
  }

  return savedId;
}

// Retrieve all saved medications and their reminder times.
export async function getAllMedications(): Promise<StoredMedication[]> {
  await ensureDatabaseReady();

  const medicationRows = await db.getAllAsync<MedicationRow>(
    `SELECT *
       FROM medications
       ORDER BY created_at DESC, id DESC`,
  );

  const reminderRows = await db.getAllAsync<ReminderRow>(
    `SELECT medication_id, reminder_time
       FROM medication_reminders
       ORDER BY id ASC`,
  );

  return medicationRows.map((row) => ({
    id: row.id,
    name: row.name,
    dosage: row.dosage,
    medicationType: row.medication_type,
    frequency: row.frequency,
    intervalHours: row.interval_hours,
    firstReminderTime: row.first_reminder_time,
    reminderTimes: reminderRows
      .filter((reminder) => reminder.medication_id === row.id)
      .map((reminder) => reminder.reminder_time),
    startDate: row.start_date,
    endDate: row.end_date,
    notes: row.notes,
    createdAt: row.created_at,
  }));
}

// Retrieve a single medication by ID.
export async function getMedicationById(
  id: number,
): Promise<StoredMedication | null> {
  const medications = await getAllMedications();

  return medications.find((medication) => medication.id === id) ?? null;
}

// Delete a medication and cancel its notifications.
export async function deleteMedication(id: number): Promise<void> {
  await ensureDatabaseReady();

  await cancelMedicationNotifications(id);

  await db.runAsync("DELETE FROM medications WHERE id = ?", [id]);
}

// Delete all medications and their notifications.
export async function deleteAllMedications(): Promise<void> {
  await ensureDatabaseReady();

  const medications = await getAllMedications();

  for (const medication of medications) {
    await cancelMedicationNotifications(medication.id);
  }

  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync("DELETE FROM medication_reminders");
    await tx.runAsync("DELETE FROM medications");
  });
}
