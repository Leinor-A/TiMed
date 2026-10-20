import { db, initializeDatabase } from "../database/database";

export type DoseStatus = "Scheduled" | "Taken" | "Missed";

export type MedicationLog = {
  id: number;
  medicationId: number;
  scheduledDate: string;
  scheduledTime: string;
  status: DoseStatus;
  takenAt: string | null;
  createdAt: string;
};

type MedicationLogRow = {
  id: number;
  medication_id: number;
  scheduled_date: string;
  scheduled_time: string;
  status: DoseStatus;
  taken_at: string | null;
  created_at: string;
};

function validateDose(
  medicationId: number,
  scheduledDate: string,
  scheduledTime: string,
): void {
  if (!Number.isInteger(medicationId) || medicationId <= 0) {
    throw new Error("Invalid medication ID.");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
    throw new Error("Invalid scheduled date.");
  }

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(scheduledTime)) {
    throw new Error("Invalid scheduled time.");
  }

  const [year, month, day] = scheduledDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error("Scheduled date does not exist.");
  }
}

function mapLog(row: MedicationLogRow): MedicationLog {
  return {
    id: row.id,
    medicationId: row.medication_id,
    scheduledDate: row.scheduled_date,
    scheduledTime: row.scheduled_time,
    status: row.status,
    takenAt: row.taken_at,
    createdAt: row.created_at,
  };
}

/**
 * Record a scheduled dose as Taken.
 *
 * Repeated calls for the same dose won't create duplicates.
 * The first confirmation timestamp is preserved.
 *
 * The UI must supply a dose generated from the saved
 * medication schedule.
 */
export async function markDoseTaken(
  medicationId: number,
  scheduledDate: string,
  scheduledTime: string,
): Promise<void> {
  await initializeDatabase();
  validateDose(medicationId, scheduledDate, scheduledTime);

  const takenAt = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO medication_logs (
      medication_id,
      scheduled_date,
      scheduled_time,
      status,
      taken_at
    )
    VALUES (?, ?, ?, 'Taken', ?)
    ON CONFLICT (
      medication_id,
      scheduled_date,
      scheduled_time
    )
    DO UPDATE SET
      status = 'Taken',
      taken_at = COALESCE(medication_logs.taken_at, excluded.taken_at)`,
    [medicationId, scheduledDate, scheduledTime, takenAt],
  );
}

/**
 * Record a dose as Missed.
 *
 * An existing Taken record is never overwritten.
 *
 * Call this only after the missed-dose policy
 * determines that a dose is overdue.
 */
export async function markDoseMissed(
  medicationId: number,
  scheduledDate: string,
  scheduledTime: string,
): Promise<void> {
  await initializeDatabase();
  validateDose(medicationId, scheduledDate, scheduledTime);

  await db.runAsync(
    `INSERT INTO medication_logs (
      medication_id,
      scheduled_date,
      scheduled_time,
      status,
      taken_at
    )
    VALUES (?, ?, ?, 'Missed', NULL)
    ON CONFLICT (
      medication_id,
      scheduled_date,
      scheduled_time
    )
    DO UPDATE SET
      status = 'Missed',
      taken_at = NULL
    WHERE medication_logs.status != 'Taken'`,
    [medicationId, scheduledDate, scheduledTime],
  );
}

/**
 * Retrieve all adherence logs for a selected date.
 */
export async function getLogsForDate(
  scheduledDate: string,
): Promise<MedicationLog[]> {
  await initializeDatabase();

  const rows = await db.getAllAsync<MedicationLogRow>(
    `SELECT *
     FROM medication_logs
     WHERE scheduled_date = ?
     ORDER BY scheduled_time ASC, id ASC`,
    [scheduledDate],
  );

  return rows.map(mapLog);
}

/**
 * Retrieve adherence logs for one medication.
 */
export async function getLogsForMedication(
  medicationId: number,
): Promise<MedicationLog[]> {
  await initializeDatabase();

  const rows = await db.getAllAsync<MedicationLogRow>(
    `SELECT *
     FROM medication_logs
     WHERE medication_id = ?
     ORDER BY scheduled_date DESC, scheduled_time DESC`,
    [medicationId],
  );

  return rows.map(mapLog);
}

/**
 * Retrieve a single scheduled dose's adherence log.
 *
 * Returns null when the dose hasn't been logged.
 */
export async function getDoseLog(
  medicationId: number,
  scheduledDate: string,
  scheduledTime: string,
): Promise<MedicationLog | null> {
  await initializeDatabase();
  validateDose(medicationId, scheduledDate, scheduledTime);

  const row = await db.getFirstAsync<MedicationLogRow>(
    `SELECT *
     FROM medication_logs
     WHERE medication_id = ?
       AND scheduled_date = ?
       AND scheduled_time = ?`,
    [medicationId, scheduledDate, scheduledTime],
  );

  return row ? mapLog(row) : null;
}
