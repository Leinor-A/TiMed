export type MedicationStatus = "Taken" | "Pending" | "Upcoming" | "Missed";

export type Medication = {
  id: number;
  name: string;
  dosage: string;
  time: string;
  status: MedicationStatus;
};

export const sampleMedications: Medication[] = [
  {
    id: 1,
    name: "Amoxicillin",
    dosage: "500 mg",
    time: "8:00 AM",
    status: "Taken",
  },
  {
    id: 2,
    name: "Vitamin C",
    dosage: "500 mg",
    time: "12:00 PM",
    status: "Pending",
  },
  {
    id: 3,
    name: "Cetirizine",
    dosage: "10 mg",
    time: "8:00 PM",
    status: "Upcoming",
  },
];
