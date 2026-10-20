import { getAllMedications } from "./medicationService";
import { getLogsForMedication, type MedicationLog } from "./adherenceService";

// Prototype adherence feedback only; not medical advice.
export const PATTERN_WINDOW_DAYS = 7;

export type AdherencePattern =
  | "insufficient-data"
  | "confirmed-taken-only"
  | "single-reported-miss"
  | "repeated-reported-misses";

export type MedicationAdherencePattern = {
  medicationId: number;
  medicationName: string;
  dosage: string;
  confirmedTaken: number;
  confirmedMissed: number;
  totalConfirmed: number;
  pattern: AdherencePattern;
  message: string;
};

export type AdherencePatternReport = {
  startDate: string;
  endDate: string;
  windowDays: number;
  medications: MedicationAdherencePattern[];
  totalConfirmedTaken: number;
  totalConfirmedMissed: number;
};

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function classifyPattern(taken: number, missed: number): {
  pattern: AdherencePattern;
  message: string;
} {
  if (taken + missed === 0) {
    return {
      pattern: "insufficient-data",
      message: "No confirmed dose responses were recorded in this period. Unconfirmed doses are not assumed to be missed.",
    };
  }

  if (missed >= 2) {
    return {
      pattern: "repeated-reported-misses",
      message: "Multiple doses were reported as missed in this period. Consider reviewing your reminder routine. For medication-specific questions, ask your pharmacist or prescriber.",
    };
  }

  if (missed === 1) {
    return {
      pattern: "single-reported-miss",
      message: "One dose was reported as missed in this period. Review your reminder routine and follow your prescribed missed-dose instructions.",
    };
  }

  return {
    pattern: "confirmed-taken-only",
    message: "All recorded responses in this period were marked Taken. This does not establish that every scheduled dose was taken.",
  };
}

function countConfirmedLogs(logs: MedicationLog[], startDate: string, endDate: string) {
  let taken = 0;
  let missed = 0;

  for (const log of logs) {
    if (log.scheduledDate < startDate || log.scheduledDate > endDate) continue;
    if (log.status === "Taken") taken++;
    if (log.status === "Missed") missed++;
  }

  return { taken, missed };
}

/**
 * Analyze confirmed adherence responses over the last seven local calendar days,
 * including today. This is descriptive pattern recognition, not medical advice.
 * Unlogged scheduled doses are not counted as Taken or Missed.
 */
export async function analyzeRecentAdherence(
  now: Date = new Date(),
): Promise<AdherencePatternReport> {
  if (Number.isNaN(now.getTime())) {
    throw new Error("Invalid analysis date.");
  }

  const endDate = localDateKey(now);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (PATTERN_WINDOW_DAYS - 1));
  const startDate = localDateKey(start);

  const medications = await getAllMedications();

  const reports = await Promise.all(
    medications.map(async (medication): Promise<MedicationAdherencePattern> => {
      const logs = await getLogsForMedication(medication.id);
      const { taken, missed } = countConfirmedLogs(logs, startDate, endDate);
      const classification = classifyPattern(taken, missed);

      return {
        medicationId: medication.id,
        medicationName: medication.name,
        dosage: medication.dosage,
        confirmedTaken: taken,
        confirmedMissed: missed,
        totalConfirmed: taken + missed,
        pattern: classification.pattern,
        message: classification.message,
      };
    }),
  );

  return {
    startDate,
    endDate,
    windowDays: PATTERN_WINDOW_DAYS,
    medications: reports,
    totalConfirmedTaken: reports.reduce((sum, item) => sum + item.confirmedTaken, 0),
    totalConfirmedMissed: reports.reduce((sum, item) => sum + item.confirmedMissed, 0),
  };
}
