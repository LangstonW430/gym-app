// Pure helpers shared by Convex functions and the Next.js client.
// Keep this file free of Convex server imports so the browser can use it.

export type Units = "lb" | "kg";
export type SetType = "warmup" | "working" | "drop" | "failure";
export type Equipment =
  | "barbell"
  | "dumbbell"
  | "cable"
  | "machine"
  | "bodyweight"
  | "kettlebell"
  | "band"
  | "other";

export const KG_PER_LB = 0.45359237;

export const MUSCLES = [
  "chest",
  "lats",
  "upper back",
  "traps",
  "lower back",
  "front delts",
  "side delts",
  "rear delts",
  "biceps",
  "triceps",
  "forearms",
  "abs",
  "quads",
  "hamstrings",
  "glutes",
  "adductors",
  "calves",
] as const;

export const EQUIPMENT: Equipment[] = [
  "barbell",
  "dumbbell",
  "cable",
  "machine",
  "bodyweight",
  "kettlebell",
  "band",
  "other",
];

export const SET_TYPES: SetType[] = ["warmup", "working", "drop", "failure"];

export const DEFAULT_INCREMENTS: Record<Equipment, { lb: number; kg: number }> = {
  barbell: { lb: 5, kg: 2.5 },
  dumbbell: { lb: 2.5, kg: 1 },
  cable: { lb: 5, kg: 2.5 },
  machine: { lb: 5, kg: 2.5 },
  bodyweight: { lb: 5, kg: 2.5 },
  kettlebell: { lb: 5, kg: 2 },
  band: { lb: 5, kg: 2.5 },
  other: { lb: 5, kg: 2.5 },
};

export const DEFAULT_PLATES = {
  lb: { bar: 45, plates: [45, 35, 25, 10, 5, 2.5] },
  kg: { bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] },
};

export const WEEKLY_SET_TARGET = { min: 10, max: 20 };

export function round(n: number, step = 0.1): number {
  return Math.round(n / step) * step;
}

/** kg (storage) -> display units, rounded for display. */
export function toDisplay(kg: number, units: Units): number {
  const v = units === "kg" ? kg : kg / KG_PER_LB;
  return Number(round(v, units === "kg" ? 0.05 : 0.1).toFixed(2));
}

/** display units -> kg (storage). */
export function fromDisplay(value: number, units: Units): number {
  return units === "kg" ? value : value * KG_PER_LB;
}

export function formatWeight(kg: number, units: Units): string {
  const v = toDisplay(kg, units);
  return `${Number.isInteger(v) ? v : v.toFixed(1)} ${units}`;
}

/** Epley estimated one-rep max. */
export function e1rm(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

export function countsForStats(setType: SetType): boolean {
  return setType !== "warmup";
}

export interface SimpleSet {
  setType: SetType;
  weight: number;
  reps: number;
  rir?: number;
}

/**
 * Double progression: if every working set last time hit the top of the rep
 * range, add one increment and drop reps to the bottom of the range.
 * Returns per-set suggestions (kg) in the same order as `last`.
 */
export function suggestNext(
  last: SimpleSet[],
  repMin: number | undefined,
  repMax: number | undefined,
  incrementKg: number,
): { weight: number; reps: number; progressed: boolean }[] {
  const working = last.filter((s) => s.setType !== "warmup");
  const canProgress =
    repMax !== undefined &&
    working.length > 0 &&
    working.every((s) => s.reps >= repMax);
  return last.map((s) => {
    if (s.setType === "warmup" || !canProgress) {
      return { weight: s.weight, reps: s.reps, progressed: false };
    }
    return {
      weight: s.weight + incrementKg,
      reps: repMin ?? s.reps,
      progressed: true,
    };
  });
}

/** Increment for the stepper, in kg, for the user's display units. */
export function stepKg(
  ex: { incrementLb: number; incrementKg: number },
  units: Units,
): number {
  return units === "kg" ? ex.incrementKg : ex.incrementLb * KG_PER_LB;
}

/** Plates per side to load `target` (display units). Greedy over the inventory. */
export function platesPerSide(
  target: number,
  bar: number,
  plates: number[],
): { plates: number[]; remainder: number } {
  let perSide = (target - bar) / 2;
  if (perSide <= 0) return { plates: [], remainder: Math.max(0, perSide * 2) };
  const sorted = [...plates].sort((a, b) => b - a);
  const out: number[] = [];
  for (const p of sorted) {
    while (perSide + 1e-9 >= p) {
      out.push(p);
      perSide -= p;
    }
  }
  return { plates: out, remainder: Number((perSide * 2).toFixed(2)) };
}

/** Local-date key YYYY-MM-DD. */
export function dateKey(ts: number | Date): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Start (local midnight) of the Monday of the week containing ts. */
export function startOfWeek(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

/** Rough duration estimate for a routine, in minutes. */
export function estimateMinutes(
  items: { targetSets: number; restSec?: number }[],
  defaultRestSec: number,
): number {
  const sec = items.reduce(
    (acc, it) => acc + it.targetSets * (40 + (it.restSec ?? defaultRestSec)),
    0,
  );
  return Math.max(5, Math.round(sec / 60 / 5) * 5);
}

export function uid(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  );
}
