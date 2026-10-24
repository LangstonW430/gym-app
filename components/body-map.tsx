"use client";

import { MuscleMap, MUSCLE_GROUPS, type MuscleGroup } from "react-muscle-map";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

// Heat levels: 0 = untouched, 1 = little stimulus, 2 = secondary / light work,
// 3 = primary mover with multiple sets. Colors live in globals.css (--heat-*).
export type Heat = 0 | 1 | 2 | 3;
export type HeatMap = Partial<Record<MuscleGroup, Heat>>;

/** The app's muscle names → regions in the body diagram. */
const REGION: Record<string, MuscleGroup[]> = {
  chest: ["chest"],
  lats: ["lats"],
  "upper back": ["middle back"],
  traps: ["traps"],
  "lower back": ["lower back"],
  "front delts": ["shoulders"],
  "side delts": ["shoulders"],
  "rear delts": ["shoulders"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  forearms: ["forearms"],
  abs: ["abdominals", "obliques"],
  quads: ["quadriceps"],
  hamstrings: ["hamstrings"],
  glutes: ["glutes"],
  adductors: ["adductors"],
  calves: ["calves"],
};

/**
 * Convert per-muscle stimulus scores (1 per primary working set, 0.5 per
 * secondary — the same counting as the weekly chart) into heat levels.
 * `scale` sets what counts as "a lot": one session vs. a whole week.
 */
export function heatFromScores(scores: Record<string, number>, scale: "workout" | "week"): HeatMap {
  const [hot, warm] = scale === "week" ? [10, 5] : [6, 3];
  const out: HeatMap = {};
  for (const [muscle, score] of Object.entries(scores)) {
    const level: Heat = score >= hot ? 3 : score >= warm ? 2 : score > 0 ? 1 : 0;
    for (const region of REGION[muscle] ?? []) out[region] = Math.max(out[region] ?? 0, level) as Heat;
  }
  return out;
}

/** One exercise: primary movers red, secondary movers orange. */
export function heatFromExercise(ex: { primaryMuscle: string; secondaryMuscles: string[] }): HeatMap {
  const out: HeatMap = {};
  for (const region of REGION[ex.primaryMuscle] ?? []) out[region] = 3;
  for (const m of ex.secondaryMuscles) for (const region of REGION[m] ?? []) out[region] = Math.max(out[region] ?? 0, 2) as Heat;
  return out;
}

/** Scores for a routine or workout plan: target sets per exercise. */
export function scoresFromPlan(items: { sets: number; exercise: { primaryMuscle: string; secondaryMuscles: string[] } | null }[]) {
  const scores: Record<string, number> = {};
  for (const it of items) {
    if (!it.exercise) continue;
    scores[it.exercise.primaryMuscle] = (scores[it.exercise.primaryMuscle] ?? 0) + it.sets;
    for (const m of it.exercise.secondaryMuscles) scores[m] = (scores[m] ?? 0) + it.sets * 0.5;
  }
  return scores;
}

/** Front + back body diagram with muscles lit by heat level. */
export function BodyHeatMap({ heat, className, title = "Muscles worked" }: { heat: HeatMap; className?: string; title?: string }) {
  const style: Record<string, string> = {};
  const lit: MuscleGroup[] = [];
  for (const m of MUSCLE_GROUPS) {
    const level = heat[m] ?? 0;
    if (level > 0) {
      style[`--bm-${m.replace(" ", "-")}`] = `var(--heat-${level})`;
      lit.push(m);
    }
  }
  return (
    <div className={cn("body-map", className)} style={style as CSSProperties}>
      <MuscleMap primaryMuscles={lit} title={title} />
    </div>
  );
}

export function HeatLegend({ className, scale }: { className?: string; scale?: "workout" | "week" | "exercise" }) {
  const labels =
    scale === "exercise"
      ? { 3: "Primary", 2: "Secondary", 1: "", 0: "Not worked" }
      : scale === "week"
        ? { 3: "10+ sets", 2: "5–9", 1: "Under 5", 0: "None" }
        : { 3: "6+ sets", 2: "3–5", 1: "Under 3", 0: "None" };
  return (
    <ul className={cn("flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground", className)}>
      {([3, 2, 1, 0] as const)
        .filter((l) => labels[l])
        .map((l) => (
          <li key={l} className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm border border-black/10" style={{ background: l ? `var(--heat-${l})` : "var(--heat-0)" }} />
            {labels[l]}
          </li>
        ))}
    </ul>
  );
}
