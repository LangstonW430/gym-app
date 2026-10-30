"use client";

// Local-first store for the in-progress workout.
//
// The whole workout lives in localStorage and is the source of truth while
// training, so it survives the app closing, the phone locking, and bad gym
// signal. A sync loop (useWorkoutSync) pushes snapshots to Convex whenever the
// local copy is dirty; the server upsert is idempotent, so retries are safe.

import { useSyncExternalStore } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import type { Equipment, SetType } from "@/convex/lib/shared";
import { uid } from "@/convex/lib/shared";
import { readJSON, writeJSON } from "./storage";

export interface LastSession {
  date: number;
  sets: { setType: SetType; weight: number; reps: number; rir?: number }[];
}

export interface LocalExercise {
  key: string;
  exerciseId: Id<"exercises">;
  name: string;
  equipment: Equipment;
  primaryMuscle: string;
  isBodyweight: boolean;
  /** Weight field is machine assistance; lower is better. */
  isAssisted?: boolean;
  incrementLb: number;
  incrementKg: number;
  restSec: number;
  repMin?: number;
  repMax?: number;
  notes?: string;
  supersetGroup?: string;
  last?: LastSession | null;
}

export interface LocalSet {
  clientId: string;
  exerciseKey: string;
  setType: SetType;
  weight: number | null; // kg
  reps: number | null;
  rir?: number;
  completedAt?: number;
  prs?: string[];
  /** Set when the pre-filled values came from double progression. */
  progressed?: boolean;
}

export interface LocalWorkout {
  clientId: string;
  routineId?: Id<"routines">;
  name: string;
  startedAt: number;
  notes?: string;
  exercises: LocalExercise[];
  sets: LocalSet[];
  updatedAt: number;
  dirty: boolean;
  serverId?: Id<"workouts">;
  /** Set when Finish was tapped; the sync loop completes it once online. */
  finishedAt?: number;
  rest?: { endsAt: number; totalSec: number; label: string; detail?: string } | null;
}

const KEY = "gym.activeWorkout.v1";
type Listener = () => void;
const listeners = new Set<Listener>();
let state: LocalWorkout | null | undefined; // undefined = not loaded yet

function load(): LocalWorkout | null {
  if (state === undefined) state = readJSON<LocalWorkout>(KEY);
  return state;
}

function emit() {
  for (const l of listeners) l();
}

export function getWorkout(): LocalWorkout | null {
  return load();
}

export function setWorkout(next: LocalWorkout | null) {
  state = next;
  writeJSON(KEY, next);
  emit();
}

/** Apply a user edit: bumps updatedAt and marks the workout for sync. */
export function editWorkout(fn: (w: LocalWorkout) => LocalWorkout) {
  const cur = load();
  if (!cur) return;
  setWorkout({ ...fn(cur), updatedAt: Date.now(), dirty: true });
}

/** Non-syncing local patch (rest timer, server ids, PR flags). */
export function patchLocal(fn: (w: LocalWorkout) => LocalWorkout) {
  const cur = load();
  if (!cur) return;
  setWorkout(fn(cur));
}

function subscribe(l: Listener) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      state = readJSON<LocalWorkout>(KEY);
      emit();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export function useLocalWorkout(): LocalWorkout | null {
  return useSyncExternalStore(subscribe, load, () => null);
}

export function newWorkout(init: {
  name: string;
  routineId?: Id<"routines">;
  exercises: LocalExercise[];
  sets: LocalSet[];
}): LocalWorkout {
  const now = Date.now();
  return {
    clientId: uid(),
    startedAt: now,
    updatedAt: now,
    dirty: true,
    ...init,
  };
}

export function toSnapshot(w: LocalWorkout) {
  const order = new Map(w.exercises.map((e, i) => [e.key, i]));
  const sets = w.exercises.flatMap((e) => w.sets.filter((s) => s.exerciseKey === e.key));
  return {
    clientId: w.clientId,
    routineId: w.routineId,
    name: w.name,
    startedAt: w.startedAt,
    notes: w.notes || undefined,
    updatedAt: w.updatedAt,
    exercises: w.exercises.map((e) => ({
      key: e.key,
      exerciseId: e.exerciseId,
      notes: e.notes || undefined,
      supersetGroup: e.supersetGroup || undefined,
      restSec: e.restSec,
      repMin: e.repMin,
      repMax: e.repMax,
    })),
    sets: sets
      .filter((s) => order.has(s.exerciseKey))
      .map((s, i) => ({
        clientId: s.clientId,
        exerciseKey: s.exerciseKey,
        exerciseId: w.exercises[order.get(s.exerciseKey)!].exerciseId,
        order: i,
        setType: s.setType,
        weight: s.weight ?? 0,
        reps: s.reps ?? 0,
        rir: s.rir,
        completedAt: s.completedAt,
      })),
  };
}

export function blankSet(exerciseKey: string, from?: Partial<LocalSet>): LocalSet {
  return {
    clientId: uid(),
    exerciseKey,
    setType: from?.setType ?? "working",
    weight: from?.weight ?? null,
    reps: from?.reps ?? null,
  };
}
