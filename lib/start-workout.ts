"use client";

import type { Doc, Id } from "@/convex/_generated/dataModel";
import { suggestNext, uid, type Units, KG_PER_LB } from "@/convex/lib/shared";
import { blankSet, newWorkout, type LastSession, type LocalExercise, type LocalSet, type LocalWorkout } from "./active-workout";

type ExerciseDoc = Doc<"exercises">;
export type LastMap = Record<string, LastSession & { workoutId?: string }>;

export function incrementKgFor(ex: { incrementLb: number; incrementKg: number }, units: Units) {
  return units === "kg" ? ex.incrementKg : ex.incrementLb * KG_PER_LB;
}

export function localExercise(
  ex: ExerciseDoc,
  opts: { restSec?: number; repMin?: number; repMax?: number; notes?: string; supersetGroup?: string; last?: LastSession | null },
): LocalExercise {
  return {
    key: uid(),
    exerciseId: ex._id,
    name: ex.name,
    equipment: ex.equipment,
    primaryMuscle: ex.primaryMuscle,
    isBodyweight: ex.isBodyweight,
    incrementLb: ex.incrementLb,
    incrementKg: ex.incrementKg,
    restSec: opts.restSec ?? ex.defaultRestSec,
    repMin: opts.repMin,
    repMax: opts.repMax,
    notes: opts.notes,
    supersetGroup: opts.supersetGroup,
    last: opts.last ?? null,
  };
}

/** Pre-filled set rows: last time's values, bumped by double progression when earned. */
export function prefillSets(ex: LocalExercise, count: number, units: Units): LocalSet[] {
  const last = ex.last?.sets ?? [];
  const sugg = suggestNext(last, ex.repMin, ex.repMax, incrementKgFor(ex, units));
  const n = Math.max(count, 1);
  const out: LocalSet[] = [];
  for (let i = 0; i < n; i++) {
    const l = last[i];
    const s = sugg[i];
    const prev = out[i - 1];
    out.push({
      ...blankSet(ex.key, {
        setType: l?.setType ?? "working",
        weight: s ? s.weight : prev?.weight ?? null,
        reps: s ? s.reps : prev?.reps ?? ex.repMin ?? null,
      }),
      progressed: s?.progressed || undefined,
    });
  }
  return out;
}

export function workoutFromRoutine(
  routine: { _id: Id<"routines">; name: string; items: (Doc<"routineExercises"> & { exercise: ExerciseDoc | null })[] },
  last: LastMap,
  units: Units,
): LocalWorkout {
  const exercises: LocalExercise[] = [];
  const sets: LocalSet[] = [];
  for (const it of routine.items) {
    if (!it.exercise) continue;
    const ex = localExercise(it.exercise, {
      restSec: it.restSec,
      repMin: it.repMin,
      repMax: it.repMax,
      notes: it.notes,
      supersetGroup: it.supersetGroup,
      last: last[it.exerciseId] ?? null,
    });
    exercises.push(ex);
    sets.push(...prefillSets(ex, it.targetSets, units));
  }
  return newWorkout({ name: routine.name, routineId: routine._id, exercises, sets });
}
