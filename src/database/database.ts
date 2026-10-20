import * as SQLite from "expo-sqlite";

// Open or create TiMed's local SQLite database.
export const db = SQLite.openDatabaseSync("timed.db");

// Share one initialization promise across calls.
let initializationPromise: Promise<void> | null = null;

export function initializeDatabase(): Promise<void> {
  if (!initializationPromise) {
    initializationPromise = db
      .execAsync(
        `
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      -- Existing medication information.
      CREATE TABLE IF NOT EXISTS medications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        dosage TEXT NOT NULL,
        medication_type TEXT NOT NULL,
        frequency TEXT NOT NULL,
        interval_hours INTEGER,
        first_reminder_time TEXT,
        start_date TEXT NOT NULL,
        end_date TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- Existing medication reminder times.
      CREATE TABLE IF NOT EXISTS medication_reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        medication_id INTEGER NOT NULL,
        reminder_time TEXT NOT NULL,
        FOREIGN KEY (medication_id)
          REFERENCES medications(id)
          ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_medication_reminders_medication
        ON medication_reminders(medication_id);

      -- New: medication adherence logs.
      -- Each record represents one scheduled dose.
      CREATE TABLE IF NOT EXISTS medication_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        medication_id INTEGER NOT NULL,
        scheduled_date TEXT NOT NULL,
        scheduled_time TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Scheduled'
          CHECK (status IN ('Scheduled', 'Taken', 'Missed')),
        taken_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (medication_id)
          REFERENCES medications(id)
          ON DELETE CASCADE,

        UNIQUE (
          medication_id,
          scheduled_date,
          scheduled_time
        )
      );

      -- Speed up lookups for a selected calendar date.
      CREATE INDEX IF NOT EXISTS idx_medication_logs_date
        ON medication_logs(scheduled_date);

      -- Speed up medication-specific adherence history.
      CREATE INDEX IF NOT EXISTS idx_medication_logs_medication
        ON medication_logs(medication_id);
    `,
      )
      .then(() => {
        console.log("TiMed database initialized successfully.");
      })
      .catch((error) => {
        initializationPromise = null;
        throw error;
      });
  }

  return initializationPromise;
}
