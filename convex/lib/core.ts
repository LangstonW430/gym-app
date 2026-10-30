// Server-side building blocks shared by the app's functions and the MCP functions.
// Everything here takes an explicit userId and scopes every read to it.

import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { SEED_EXERCISES, isBodyweightSeed } from "./seedExercises";
import { isAssistedExercise } from "./shared";
import {
  DEFAULT_INCREMENTS,
  DEFAULT_PLATES,
  countsForStats,
  e1rm,
  estimateMinutes,
  startOfWeek,
  type Equipment,
  type SetType,
} from "./shared";

export type Ctx = QueryCtx | MutationCtx;

export async function requireUserId(ctx: Ctx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("Not signed in");
  return userId;
}

export async function getSettings(ctx: Ctx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  return {
    units: user?.units ?? ("lb" as const),
    defaultRestSec: user?.defaultRestSec ?? 120,
    plateInventory: user?.plateInventory ?? DEFAULT_PLATES,
  };
}

// ---------------------------------------------------------------------------
// Ownership checks

export async function ownedExercise(
  ctx: Ctx,
  userId: Id<"users">,
  id: Id<"exercises">,
): Promise<Doc<"exercises">> {
  const ex = await ctx.db.get(id);
  if (!ex || ex.userId !== userId) throw new ConvexError(`Exercise ${id} not found`);
  return ex;
}

export async function ownedRoutine(
  ctx: Ctx,
  userId: Id<"users">,
  id: Id<"routines">,
): Promise<Doc<"routines">> {
  const r = await ctx.db.get(id);
  if (!r || r.userId !== userId) throw new ConvexError(`Routine ${id} not found`);
  return r;
}

export async function ownedProgram(
  ctx: Ctx,
  userId: Id<"users">,
  id: Id<"programs">,
): Promise<Doc<"programs">> {
  const p = await ctx.db.get(id);
  if (!p || p.userId !== userId) throw new ConvexError(`Program ${id} not found`);
  return p;
}

export async function ownedWorkout(
  ctx: Ctx,
  userId: Id<"users">,
  id: Id<"workouts">,
): Promise<Doc<"workouts">> {
  const w = await ctx.db.get(id);
  if (!w || w.userId !== userId) throw new ConvexError(`Workout ${id} not found`);
  return w;
}

// ---------------------------------------------------------------------------
// Seeding

export async function ensureSeeded(ctx: MutationCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (!user || user.seededAt) return;
  for (const [name, primary, secondary, equipment, restSec] of SEED_EXERCISES) {
    const inc = DEFAULT_INCREMENTS[equipment];
    await ctx.db.insert("exercises", {
      userId,
      name,
      primaryMuscle: primary,
      secondaryMuscles: secondary,
      equipment,
      incrementLb: inc.lb,
      incrementKg: inc.kg,
      defaultRestSec: restSec ?? 90,
      isBodyweight: isBodyweightSeed(name),
      isAssisted: isAssistedExercise({ name }) || undefined,
      isCustom: false,
    });
  }
  await ctx.db.patch(userId, {
    seededAt: Date.now(),
    units: user.units ?? "lb",
    defaultRestSec: user.defaultRestSec ?? 120,
    plateInventory: user.plateInventory ?? DEFAULT_PLATES,
  });
}

export async function createExercise(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: {
    name: string;
    primaryMuscle: string;
    secondaryMuscles?: string[];
    equipment: Equipment;
    defaultRestSec?: number;
    incrementLb?: number;
    incrementKg?: number;
    isBodyweight?: boolean;
    isAssisted?: boolean;
  },
) {
  const name = args.name.trim();
  if (!name) throw new ConvexError("Name is required");
  const existing = await ctx.db
    .query("exercises")
    .withIndex("by_user_name", (q) => q.eq("userId", userId).eq("name", name))
    .first();
  if (existing && !existing.archived) {
    throw new ConvexError(`An exercise named "${name}" already exists (${existing._id})`);
  }
  const inc = DEFAULT_INCREMENTS[args.equipment];
  return await ctx.db.insert("exercises", {
    userId,
    name,
    primaryMuscle: args.primaryMuscle,
    secondaryMuscles: args.secondaryMuscles ?? [],
    equipment: args.equipment,
    incrementLb: args.incrementLb ?? inc.lb,
    incrementKg: args.incrementKg ?? inc.kg,
    defaultRestSec: args.defaultRestSec ?? 90,
    isBodyweight: args.isBodyweight ?? args.equipment === "bodyweight",
    isAssisted: args.isAssisted ?? (isAssistedExercise({ name }) || undefined),
    isCustom: true,
  });
}

// ---------------------------------------------------------------------------
// Routines and programs

export interface RoutineItemInput {
  exerciseId: Id<"exercises">;
  targetSets: number;
  repMin: number;
  repMax: number;
  restSec?: number;
  supersetGroup?: string;
  notes?: string;
}

function validateItem(it: RoutineItemInput) {
  if (it.targetSets < 1 || it.targetSets > 20) throw new ConvexError("targetSets must be 1-20");
  if (it.repMin < 1 || it.repMax < it.repMin || it.repMax > 100) {
    throw new ConvexError("Rep range must satisfy 1 <= repMin <= repMax <= 100");
  }
}

export async function writeRoutineItems(
  ctx: MutationCtx,
  userId: Id<"users">,
  routineId: Id<"routines">,
  items: RoutineItemInput[],
) {
  for (const it of items) {
    validateItem(it);
    await ownedExercise(ctx, userId, it.exerciseId);
  }
  const old = await ctx.db
    .query("routineExercises")
    .withIndex("by_routine", (q) => q.eq("routineId", routineId))
    .collect();
  for (const o of old) await ctx.db.delete(o._id);
  for (let i = 0; i < items.length; i++) {
    await ctx.db.insert("routineExercises", { routineId, order: i, ...items[i] });
  }
}

export async function createRoutine(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: {
    name: string;
    programId?: Id<"programs">;
    notes?: string;
    exercises: RoutineItemInput[];
  },
) {
  if (args.programId) await ownedProgram(ctx, userId, args.programId);
  const routineId = await ctx.db.insert("routines", {
    userId,
    programId: args.programId,
    name: args.name.trim() || "Routine",
    notes: args.notes,
    archived: false,
  });
  await writeRoutineItems(ctx, userId, routineId, args.exercises);
  if (args.programId) {
    const p = await ctx.db.get(args.programId);
    if (p) await ctx.db.patch(p._id, { routineOrder: [...p.routineOrder, routineId] });
  }
  return routineId;
}

/** Follow supersededBy links to the current version of a routine. */
export async function resolveRoutine(
  ctx: Ctx,
  id: Id<"routines">,
): Promise<Doc<"routines"> | null> {
  let r = await ctx.db.get(id);
  for (let i = 0; r && r.supersededBy && i < 20; i++) {
    r = await ctx.db.get(r.supersededBy);
  }
  return r;
}

export async function routineItems(ctx: Ctx, routineId: Id<"routines">) {
  const items = await ctx.db
    .query("routineExercises")
    .withIndex("by_routine", (q) => q.eq("routineId", routineId))
    .collect();
  return await Promise.all(
    items.map(async (it) => ({ ...it, exercise: await ctx.db.get(it.exerciseId) })),
  );
}

export async function getRoutineFull(ctx: Ctx, userId: Id<"users">, routineId: Id<"routines">) {
  const routine = await ownedRoutine(ctx, userId, routineId);
  const items = await routineItems(ctx, routineId);
  const { defaultRestSec } = await getSettings(ctx, userId);
  return {
    ...routine,
    items,
    estimatedMinutes: estimateMinutes(items, defaultRestSec),
  };
}

export async function getActiveProgram(ctx: Ctx, userId: Id<"users">) {
  const programs = await ctx.db
    .query("programs")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return programs.find((p) => p.isActive && !p.archived) ?? null;
}

/**
 * Next routine in program order (not by weekday): the one after the most
 * recently completed routine from the active program.
 */
export async function nextUp(ctx: Ctx, userId: Id<"users">) {
  const program = await getActiveProgram(ctx, userId);
  if (!program || program.routineOrder.length === 0) return null;
  const order = program.routineOrder;
  const recent = await ctx.db
    .query("workouts")
    .withIndex("by_user_started", (q) => q.eq("userId", userId))
    .order("desc")
    .take(50);
  let nextIndex = 0;
  for (const w of recent) {
    if (w.status !== "done" || !w.routineId) continue;
    const current = await resolveRoutine(ctx, w.routineId);
    const idx = current ? order.indexOf(current._id) : -1;
    if (idx >= 0) {
      nextIndex = (idx + 1) % order.length;
      break;
    }
  }
  const routineId = order[nextIndex];
  const routine = await getRoutineFull(ctx, userId, routineId);
  return { program, routine };
}

// ---------------------------------------------------------------------------
// Workout sets, PRs, stats

export async function workoutSetsOf(ctx: Ctx, workoutId: Id<"workouts">) {
  return await ctx.db
    .query("workoutSets")
    .withIndex("by_workout", (q) => q.eq("workoutId", workoutId))
    .collect();
}

function sameKinds(a: string[] | undefined, b: string[]) {
  const aa = a ?? [];
  return aa.length === b.length && aa.every((x, i) => x === b[i]);
}

/**
 * Recompute every PR for one exercise from its sets (sets are the source of
 * truth). Also stamps each set with the PR kinds it set at the time.
 */
export async function recomputePRs(
  ctx: MutationCtx,
  userId: Id<"users">,
  exerciseId: Id<"exercises">,
) {
  const sets = await ctx.db
    .query("workoutSets")
    .withIndex("by_user_exercise_time", (q) =>
      q.eq("userId", userId).eq("exerciseId", exerciseId).gt("completedAt", 0),
    )
    .collect();
  const exercise = await ctx.db.get(exerciseId);
  // Assisted: the "weight" record is the least assistance, and e1RM is meaningless.
  const assisted = !!exercise && isAssistedExercise(exercise);

  type Rec = { value: number; prev?: number; set: Doc<"workoutSets"> };
  let bestWeight: Rec | undefined;
  let bestE1rm: Rec | undefined;
  const repsAt = new Map<number, Rec>();

  for (const s of sets) {
    const kinds: ("weight" | "e1rm" | "reps")[] = [];
    if (countsForStats(s.setType as SetType) && s.reps > 0) {
      if (assisted) {
        if (!bestWeight || s.weight < bestWeight.value - 1e-6) {
          if (bestWeight) kinds.push("weight");
          bestWeight = { value: s.weight, prev: bestWeight?.value, set: s };
        }
      } else if (s.weight > 0) {
        if (!bestWeight || s.weight > bestWeight.value + 1e-6) {
          if (bestWeight) kinds.push("weight");
          bestWeight = { value: s.weight, prev: bestWeight?.value, set: s };
        }
        const est = e1rm(s.weight, s.reps);
        if (!bestE1rm || est > bestE1rm.value + 1e-6) {
          if (bestE1rm) kinds.push("e1rm");
          bestE1rm = { value: est, prev: bestE1rm?.value, set: s };
        }
      }
      const wKey = Math.round(s.weight * 100) / 100;
      const r = repsAt.get(wKey);
      if (!r || s.reps > r.value) {
        if (r) kinds.push("reps");
        repsAt.set(wKey, { value: s.reps, prev: r?.value, set: s });
      }
    }
    if (!sameKinds(s.prs, kinds)) {
      await ctx.db.patch(s._id, { prs: kinds.length ? kinds : undefined });
    }
  }

  const old = await ctx.db
    .query("personalRecords")
    .withIndex("by_user_exercise", (q) => q.eq("userId", userId).eq("exerciseId", exerciseId))
    .collect();
  for (const o of old) await ctx.db.delete(o._id);

  const insert = (kind: "weight" | "e1rm" | "reps", rec: Rec, weight?: number) =>
    ctx.db.insert("personalRecords", {
      userId,
      exerciseId,
      kind,
      value: rec.value,
      weight,
      previousValue: rec.prev,
      setId: rec.set._id,
      workoutId: rec.set.workoutId,
      achievedAt: rec.set.completedAt!,
    });
  if (bestWeight) await insert("weight", bestWeight);
  if (bestE1rm) await insert("e1rm", bestE1rm);
  for (const [w, rec] of repsAt) await insert("reps", rec, w);
}

export async function summarizeWorkout(ctx: Ctx, workout: Doc<"workouts">) {
  const sets = (await workoutSetsOf(ctx, workout._id)).filter((s) => s.completedAt);
  const exIds = [...new Set(sets.map((s) => s.exerciseId))];
  const exercises = new Map(
    (await Promise.all(exIds.map((id) => ctx.db.get(id))))
      .filter((e): e is Doc<"exercises"> => !!e)
      .map((e) => [e._id, e]),
  );
  let volume = 0;
  let workingSets = 0;
  const musclesSets: Record<string, number> = {};
  const prs: { exerciseId: Id<"exercises">; exercise: string; kinds: string[]; weight: number; reps: number }[] = [];
  for (const s of sets) {
    const ex = exercises.get(s.exerciseId);
    if (!countsForStats(s.setType as SetType)) continue;
    workingSets++;
    volume += s.weight * s.reps;
    if (ex) {
      musclesSets[ex.primaryMuscle] = (musclesSets[ex.primaryMuscle] ?? 0) + 1;
      for (const m of ex.secondaryMuscles) musclesSets[m] = (musclesSets[m] ?? 0) + 0.5;
    }
    const kinds = (s.prs ?? []).filter((k) => k !== "reps");
    if (kinds.length) {
      prs.push({ exerciseId: s.exerciseId, exercise: ex?.name ?? "?", kinds, weight: s.weight, reps: s.reps });
    }
  }
  return {
    durationSec: workout.endedAt ? Math.round((workout.endedAt - workout.startedAt) / 1000) : undefined,
    volumeKg: Math.round(volume),
    workingSets,
    exerciseCount: exIds.length,
    musclesSets,
    prs,
  };
}

export async function listWorkouts(
  ctx: Ctx,
  userId: Id<"users">,
  from: number,
  to: number,
  limit = 500,
) {
  return await ctx.db
    .query("workouts")
    .withIndex("by_user_started", (q) =>
      q.eq("userId", userId).gte("startedAt", from).lte("startedAt", to),
    )
    .order("desc")
    .filter((q) => q.eq(q.field("status"), "done"))
    .take(limit);
}

/** Every completed set of one exercise, grouped into sessions. */
export async function exerciseSessions(
  ctx: Ctx,
  userId: Id<"users">,
  exerciseId: Id<"exercises">,
  from = 0,
  to = Number.MAX_SAFE_INTEGER,
) {
  const sets = await ctx.db
    .query("workoutSets")
    .withIndex("by_user_exercise_time", (q) =>
      q.eq("userId", userId).eq("exerciseId", exerciseId).gte("completedAt", Math.max(1, from)).lte("completedAt", to),
    )
    .collect();
  const exercise = await ctx.db.get(exerciseId);
  const assisted = !!exercise && isAssistedExercise(exercise);
  const byWorkout = new Map<Id<"workouts">, Doc<"workoutSets">[]>();
  for (const s of sets) {
    const arr = byWorkout.get(s.workoutId) ?? [];
    arr.push(s);
    byWorkout.set(s.workoutId, arr);
  }
  const sessions = [];
  for (const [workoutId, ss] of byWorkout) {
    ss.sort((a, b) => a.order - b.order);
    const working = ss.filter((s) => countsForStats(s.setType as SetType));
    let best = 0;
    let top: Doc<"workoutSets"> | undefined;
    let volume = 0;
    for (const s of working) {
      if (!assisted) best = Math.max(best, e1rm(s.weight, s.reps));
      // Top set: heaviest, or for assisted lifts the least assistance; more reps breaks ties.
      const better = assisted ? s.weight < (top?.weight ?? Infinity) : s.weight > (top?.weight ?? -Infinity);
      if (!top || better || (s.weight === top.weight && s.reps > top.reps)) top = s;
      volume += s.weight * s.reps;
    }
    sessions.push({
      workoutId,
      date: Math.min(...ss.map((s) => s.completedAt!)),
      e1rm: best,
      topSet: top ? { weight: top.weight, reps: top.reps } : null,
      volume,
      sets: ss.map((s) => ({
        _id: s._id,
        setType: s.setType,
        weight: s.weight,
        reps: s.reps,
        rir: s.rir,
        prs: s.prs,
      })),
    });
  }
  sessions.sort((a, b) => a.date - b.date);
  return sessions;
}

/** Working sets per muscle per week (primary = 1, each secondary = 0.5). */
export async function weeklyMuscleSets(
  ctx: Ctx,
  userId: Id<"users">,
  from: number,
  to: number,
  // Client's Date#getTimezoneOffset(), so weeks start at the user's local Monday.
  tzOffsetMin = 0,
) {
  const sets = await ctx.db
    .query("workoutSets")
    .withIndex("by_user_time", (q) =>
      q.eq("userId", userId).gte("completedAt", Math.max(1, from)).lte("completedAt", to),
    )
    .collect();
  const exCache = new Map<Id<"exercises">, Doc<"exercises"> | null>();
  const weeks = new Map<number, Record<string, number>>();
  for (const s of sets) {
    if (!countsForStats(s.setType as SetType)) continue;
    if (!exCache.has(s.exerciseId)) exCache.set(s.exerciseId, await ctx.db.get(s.exerciseId));
    const ex = exCache.get(s.exerciseId);
    if (!ex) continue;
    const shift = tzOffsetMin * 60_000;
    const wk = startOfWeek(s.completedAt! - shift) + shift;
    const rec = weeks.get(wk) ?? {};
    rec[ex.primaryMuscle] = (rec[ex.primaryMuscle] ?? 0) + 1;
    for (const m of ex.secondaryMuscles) rec[m] = (rec[m] ?? 0) + 0.5;
    weeks.set(wk, rec);
  }
  return [...weeks.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([weekStart, muscles]) => ({ weekStart, muscles }));
}
