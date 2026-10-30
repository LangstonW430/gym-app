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

/**
 * Assisted exercises (assisted pull-up/dip machines) log the assistance in the
 * weight field, so less is better: PRs, progression and charts all invert.
 * The flag wins when set; otherwise the name decides, so existing libraries
 * work without a migration.
 */
export function isAssistedExercise(e: { name: string; isAssisted?: boolean }): boolean {
  return e.isAssisted ?? /\bassist/i.test(e.name);
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
  assisted = false,
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
      // Assisted lifts progress by taking assistance away.
      weight: assisted ? Math.max(0, s.weight - incrementKg) : s.weight + incrementKg,
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

// ---------------------------------------------------------------------------
// Exercise similarity (the "Recommended" tab when swapping an exercise).

export interface SimilarityInput {
  name: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment: Equipment;
  isBodyweight?: boolean;
}

/** Movement patterns inferred from the name; the first matching group wins. */
const MOVEMENT_PATTERNS: [label: string, keywords: string[]][] = [
  ["row", ["row"]],
  ["vertical pull", ["pulldown", "pull-up", "pull up", "chin-up", "chin up"]],
  ["fly", ["fly", "crossover", "pec deck"]],
  ["curl", ["curl"]],
  ["hinge", ["deadlift", "rdl", "romanian", "good morning", "hip thrust", "glute bridge", "back extension", "hyperextension", "pull-through", "pull through"]],
  ["squat", ["squat", "leg press", "hack", "lunge", "step-up", "step up"]],
  ["triceps extension", ["pushdown", "skull crusher", "kickback", "extension"]],
  ["press", ["press", "push-up", "push up", "dip"]],
  ["shrug", ["shrug"]],
  ["core", ["crunch", "plank", "sit-up", "sit up", "rollout", "woodchop", "leg raise"]],
];

export function movementPattern(name: string): string | null {
  const n = name.toLowerCase();
  for (const [label, keywords] of MOVEMENT_PATTERNS) {
    if (keywords.some((k) => n.includes(k))) return label;
  }
  return null;
}

const NAME_STOP_WORDS = new Set([...EQUIPMENT, "the", "and", "with", "to", "arm", "grip", "machine", "smith", "ez", "bar"]);

function nameTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-z]+/g, " ")
      .split(" ")
      .filter((t) => t.length > 2 && !NAME_STOP_WORDS.has(t)),
  );
}

export interface Similarity {
  score: number;
  /** Short, display-ready reasons in order of weight (e.g. "Same muscle"). */
  reasons: string[];
}

/**
 * How alike two exercises are, 0 = unrelated. Primary muscle dominates, then
 * movement pattern, secondary muscle overlap and equipment, with a small nudge
 * for shared words in the name so "Incline Bench Press (Dumbbell)" lands right
 * next to "Incline Bench Press (Barbell)".
 */
export function similarity(target: SimilarityInput, candidate: SimilarityInput): Similarity {
  let score = 0;
  const reasons: string[] = [];

  if (candidate.primaryMuscle === target.primaryMuscle) {
    score += 50;
    reasons.push("Same muscle");
  } else if (
    target.secondaryMuscles.includes(candidate.primaryMuscle) ||
    candidate.secondaryMuscles.includes(target.primaryMuscle)
  ) {
    score += 20;
    reasons.push(`Hits ${target.primaryMuscle}`);
  }

  const pattern = movementPattern(target.name);
  if (pattern && pattern === movementPattern(candidate.name)) {
    score += 15;
    reasons.push("Same movement");
  }

  const shared = candidate.secondaryMuscles.filter((m) => target.secondaryMuscles.includes(m)).length;
  score += Math.min(shared, 3) * 5;

  if (candidate.equipment === target.equipment) {
    score += 10;
    reasons.push("Same equipment");
  }
  if (!!candidate.isBodyweight === !!target.isBodyweight) score += 3;

  const a = nameTokens(target.name);
  const b = nameTokens(candidate.name);
  let words = 0;
  for (const t of a) if (b.has(t)) words++;
  score += Math.min(words, 3) * 2;

  return { score, reasons };
}

/** Candidates ranked most-similar first; unrelated ones are left out. */
export function rankSimilar<T extends SimilarityInput>(
  target: SimilarityInput,
  candidates: T[],
  minScore = 20,
): (Similarity & { exercise: T })[] {
  return candidates
    .map((exercise) => ({ exercise, ...similarity(target, exercise) }))
    .filter((r) => r.score >= minScore)
    .sort((x, y) => y.score - x.score || x.exercise.name.localeCompare(y.exercise.name));
}
