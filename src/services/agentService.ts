import { getAllMedications, type StoredMedication } from "./medicationService";
import { getLogsForDate, type MedicationLog } from "./adherenceService";

// Prototype follow-up threshold, not medical dosing guidance.
export const DOSE_GRACE_PERIOD_MINUTES = 30;

export type DoseState =
  | "Upcoming"
  | "Due"
  | "Awaiting Follow-Up"
  | "Taken"
  | "Missed";

export type AgentDose = {
  id: string;
  medicationId: number;
  medicationName: string;
  dosage: string;
  scheduledDate: string;
  scheduledTime: string;
  minutesOverdue: number;
};

export type EvaluatedDose = AgentDose & {
  state: DoseState;
};

export type AgentMonitoringResult = {
  date: string;
  totalScheduled: number;
  totalTaken: number;
  totalMissed: number;
  awaitingFollowUp: AgentDose[];
};

export type DetailedAgentMonitoringResult = AgentMonitoringResult & {
  totalUpcoming: number;
  totalDue: number;
  totalAwaitingFollowUp: number;
  doses: EvaluatedDose[];
};

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localDateTime(date: string, time: string): number {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes).getTime();
}

function isMedicationActive(medication: StoredMedication, date: string): boolean {
  return (
    medication.startDate <= date &&
    (!medication.endDate || medication.endDate >= date)
  );
}

function getIntervalTimesForDate(medication: StoredMedication, date: string): string[] {
  if (
    !medication.intervalHours ||
    medication.intervalHours <= 0 ||
    !medication.firstReminderTime
  ) {
    return [];
  }

  const intervalMs = medication.intervalHours * 60 * 60 * 1000;
  const firstDose = localDateTime(
    medication.startDate,
    medication.firstReminderTime,
  );
  const [year, month, day] = date.split("-").map(Number);
  const dayStart = new Date(year, month - 1, day).getTime();
  const nextDayStart = new Date(year, month - 1, day + 1).getTime();
  const firstIndex = Math.max(0, Math.ceil((dayStart - firstDose) / intervalMs));
  const times: string[] = [];

  for (let index = firstIndex; ; index++) {
    const timestamp = firstDose + index * intervalMs;
    if (timestamp >= nextDayStart) break;
    if (timestamp >= dayStart) {
      const doseDate = new Date(timestamp);
      const hours = String(doseDate.getHours()).padStart(2, "0");
      const minutes = String(doseDate.getMinutes()).padStart(2, "0");
      times.push(`${hours}:${minutes}`);
    }
  }
  return times;
}

function getScheduledTimes(medication: StoredMedication, date: string): string[] {
  if (!isMedicationActive(medication, date)) return [];
  if (medication.frequency === "Every X Hours") {
    return getIntervalTimesForDate(medication, date);
  }
  return medication.reminderTimes;
}

function findDoseLog(
  logs: MedicationLog[],
  medicationId: number,
  date: string,
  time: string,
): MedicationLog | undefined {
  return logs.find(
    (log) =>
      log.medicationId === medicationId &&
      log.scheduledDate === date &&
      log.scheduledTime === time,
  );
}

/**
 * Determine the current state of one scheduled dose.
 * Only explicit adherence logs can produce Taken or Missed.
 */
export function evaluateDoseState(
  scheduledTimestamp: number,
  logStatus: MedicationLog["status"] | null | undefined,
  nowTimestamp: number = Date.now(),
): DoseState {
  if (logStatus === "Taken") return "Taken";
  if (logStatus === "Missed") return "Missed";

  const elapsedMinutes = (nowTimestamp - scheduledTimestamp) / 60_000;
  if (elapsedMinutes < 0) return "Upcoming";
  if (elapsedMinutes <= DOSE_GRACE_PERIOD_MINUTES) return "Due";
  return "Awaiting Follow-Up";
}

/**
 * Detailed monitoring for today's doses, including upcoming and due doses.
 * No database writes are performed by this function.
 */
export async function monitorTodaysMedicationsDetailed(
  now: Date = new Date(),
): Promise<DetailedAgentMonitoringResult> {
  const date = formatLocalDate(now);
  const [medications, logs] = await Promise.all([
    getAllMedications(),
    getLogsForDate(date),
  ]);

  const doses: EvaluatedDose[] = [];
  const awaitingFollowUp: AgentDose[] = [];
  let totalTaken = 0;
  let totalMissed = 0;
  let totalUpcoming = 0;
  let totalDue = 0;
  const currentTimestamp = now.getTime();

  for (const medication of medications) {
    for (const time of getScheduledTimes(medication, date)) {
      const log = findDoseLog(logs, medication.id, date, time);
      const scheduledTimestamp = localDateTime(date, time);
      const minutesOverdue = Math.floor(
        (currentTimestamp - scheduledTimestamp) / 60_000,
      );
      const state = evaluateDoseState(
        scheduledTimestamp,
        log?.status,
        currentTimestamp,
      );

      const dose: EvaluatedDose = {
        id: `${medication.id}-${date}-${time}`,
        medicationId: medication.id,
        medicationName: medication.name,
        dosage: medication.dosage,
        scheduledDate: date,
        scheduledTime: time,
        minutesOverdue,
        state,
      };
      doses.push(dose);

      switch (state) {
        case "Taken":
          totalTaken++;
          break;
        case "Missed":
          totalMissed++;
          break;
        case "Upcoming":
          totalUpcoming++;
          break;
        case "Due":
          totalDue++;
          break;
        case "Awaiting Follow-Up": {
          // Keep the original AgentDose shape for existing screens.
          const { state: _state, ...followUpDose } = dose;
          awaitingFollowUp.push(followUpDose);
          break;
        }
      }
    }
  }

  doses.sort((a, b) =>
    a.scheduledTime.localeCompare(b.scheduledTime) ||
    a.medicationId - b.medicationId,
  );
  awaitingFollowUp.sort((a, b) =>
    a.scheduledTime.localeCompare(b.scheduledTime) ||
    a.medicationId - b.medicationId,
  );

  return {
    date,
    totalScheduled: doses.length,
    totalTaken,
    totalMissed,
    totalUpcoming,
    totalDue,
    totalAwaitingFollowUp: awaitingFollowUp.length,
    awaitingFollowUp,
    doses,
  };
}

/**
 * Backward-compatible API used by the existing Follow-Up screen.
 */
export async function monitorTodaysMedications(
  now: Date = new Date(),
): Promise<AgentMonitoringResult> {
  const result = await monitorTodaysMedicationsDetailed(now);
  return {
    date: result.date,
    totalScheduled: result.totalScheduled,
    totalTaken: result.totalTaken,
    totalMissed: result.totalMissed,
    awaitingFollowUp: result.awaitingFollowUp,
  };
}
