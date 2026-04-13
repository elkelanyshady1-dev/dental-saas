/**
 * prescriptions.ts — Orthodontic Bracket Prescription Database
 * =============================================================
 * Multi-prescription system with tip/torque values for all FDI teeth.
 * Supports: MBT, Roth, Andrews, Alexander, Damon, Ricketts
 */

export type ToothID =
  | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18
  | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28
  | 31 | 32 | 33 | 34 | 35 | 36 | 37 | 38
  | 41 | 42 | 43 | 44 | 45 | 46 | 47 | 48;

export type PrescriptionType =
  | "MBT"
  | "Roth"
  | "Andrews"
  | "Alexander"
  | "Damon"
  | "Ricketts";

export type PrescriptionValues = {
  tip: number;
  torque: number;
  rotation?: number;
};

export type FullPrescription = Record<ToothID, PrescriptionValues>;

const U = (ids: number[], val: PrescriptionValues) =>
  Object.fromEntries(ids.map(id => [id, val]));

export const MBT: FullPrescription = {
  ...U([11,21], { tip: 4, torque: 17 }),
  ...U([12,22], { tip: 8, torque: 10 }),
  ...U([13,23], { tip: 8, torque: -7 }),
  ...U([14,15,24,25], { tip: 0, torque: -7 }),
  ...U([16,17,26,27], { tip: 0, torque: -14, rotation: 10 }),
  ...U([18,28], { tip: 0, torque: -14 }),
  ...U([31,32,41,42], { tip: 2, torque: -1 }),
  ...U([33,43], { tip: 3, torque: -11 }),
  ...U([34,44], { tip: 2, torque: -12 }),
  ...U([35,45], { tip: 2, torque: -17 }),
  ...U([36,37,46,47], { tip: 0, torque: -20 }),
  ...U([38,48], { tip: 0, torque: -20 }),
} as FullPrescription;

export const Roth: FullPrescription = {
  ...U([11,21], { tip: 5, torque: 12 }),
  ...U([12,22], { tip: 9, torque: 8 }),
  ...U([13,23], { tip: 9, torque: -2 }),
  ...U([14,15,24,25], { tip: 0, torque: -7 }),
  ...U([16,17,26,27], { tip: 5, torque: -14, rotation: 14 }),
  ...U([18,28], { tip: 5, torque: -14 }),
  ...U([31,32,41,42], { tip: 2, torque: -1 }),
  ...U([33,43], { tip: 7, torque: -11 }),
  ...U([34,44], { tip: 0, torque: -17 }),
  ...U([35,45], { tip: 0, torque: -22 }),
  ...U([36,37,46,47], { tip: 1, torque: -30 }),
  ...U([38,48], { tip: 1, torque: -30 }),
} as FullPrescription;

export const Andrews: FullPrescription = {
  ...U([11,21], { tip: 5, torque: 7 }),
  ...U([12,22], { tip: 9, torque: 3 }),
  ...U([13,23], { tip: 11, torque: -7 }),
  ...U([14,15,24,25], { tip: 2, torque: -7 }),
  ...U([16,17,26,27], { tip: 5, torque: -9 }),
  ...U([18,28], { tip: 5, torque: -9 }),
  ...U([31,32,41,42], { tip: 2, torque: -1 }),
  ...U([33,43], { tip: 5, torque: -11 }),
  ...U([34,44], { tip: 2, torque: -17 }),
  ...U([35,45], { tip: 2, torque: -22 }),
  ...U([36,37,46,47], { tip: 2, torque: -25 }),
  ...U([38,48], { tip: 2, torque: -25 }),
} as FullPrescription;

export const Alexander: FullPrescription = {
  ...U([11,21], { tip: 5, torque: 15 }),
  ...U([12,22], { tip: 9, torque: 9 }),
  ...U([13,23], { tip: 10, torque: -3 }),
  ...U([14], { tip: 0, torque: -6 }),
  ...U([15], { tip: 4, torque: -8 }),
  ...U([24], { tip: 0, torque: -6 }),
  ...U([25], { tip: 4, torque: -8 }),
  ...U([16,17,26,27], { tip: 0, torque: -10 }),
  ...U([31,41], { tip: 2, torque: -5 }),
  ...U([32,42], { tip: 6, torque: 5 }),
  ...U([33,43], { tip: 6, torque: -7 }),
  ...U([34,44], { tip: 0, torque: -7 }),
  ...U([35,45], { tip: 0, torque: -9 }),
  ...U([36,37,46,47], { tip: 0, torque: -10 }),
  ...U([38,48], { tip: 0, torque: -10 }),
} as FullPrescription;

export const Damon: FullPrescription = {
  ...U([11,21], { tip: 5, torque: 15 }),
  ...U([12,22], { tip: 9, torque: 6 }),
  ...U([13,23], { tip: 5, torque: 7 }),
  ...U([14,15,24,25], { tip: 2, torque: -11 }),
  ...U([16,17,26,27], { tip: 0, torque: -18 }),
  ...U([18,28], { tip: 0, torque: -27 }),
  ...U([31,32,41,42], { tip: 2, torque: -3 }),
  ...U([33,43], { tip: 5, torque: 7 }),
  ...U([34,44], { tip: 4, torque: -12 }),
  ...U([35,45], { tip: 4, torque: -17 }),
  ...U([36,37,46,47], { tip: 2, torque: -28 }),
  ...U([38,48], { tip: 2, torque: -10 }),
} as FullPrescription;

export const Ricketts: FullPrescription = {
  ...U([11,21], { tip: 0, torque: 22 }),
  ...U([12,22], { tip: 8, torque: 14 }),
  ...U([13,23], { tip: 5, torque: 7 }),
  ...U([14,15,24,25], { tip: 0, torque: 0 }),
  ...U([16,17,26,27], { tip: 0, torque: 0 }),
  ...U([18,28], { tip: 0, torque: 0 }),
  ...U([31,32,41,42], { tip: 0, torque: 0 }),
  ...U([33,43], { tip: 5, torque: 7 }),
  ...U([34,35,44,45], { tip: 0, torque: 0 }),
  ...U([36,37,46,47], { tip: 0, torque: 0 }),
  ...U([38,48], { tip: 0, torque: 0 }),
} as FullPrescription;

export const PRESCRIPTIONS = {
  MBT,
  Roth,
  Andrews,
  Alexander,
  Damon,
  Ricketts,
};

export const getPrescription = (
  type: PrescriptionType,
  toothId: ToothID
): PrescriptionValues => {
  return PRESCRIPTIONS[type][toothId];
};
