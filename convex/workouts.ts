import { ConvexError, v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import {
  listWorkouts,
  ownedExercise,
  ownedWorkout,
  recomputePRs,
  requireUserId,
  summarizeWorkout,
  workoutSetsOf,
} from "./lib/core";
import { setType, workoutExercise } from "./schema";

// The active-workout screen is local-first: the client keeps the whole workout
// in localStorage and pushes snapshots here. Sync is idempotent (keyed by
// client ids), so a snapshot can be retried after a dropped connection or an
// app restart without duplicating anything.

const snapshotSet = v.object({
  clientId: v.string(),
  exerciseKey: v.string(),
  exerciseId: v.id("exercises"),
  order: v.number(),
  setType,
  weight: v.number(),
  reps: v.number(),
  rir: v.optional(v.number()),
  completedAt: v.optional(v.number()),
});

export const snapshot = v.object({
  clientId: v.string(),
  routineId: v.optional(v.id("routines")),
  name: v.string(),
  startedAt: v.number(),
  notes: v.optional(v.string()),
  exercises: v.array(workoutExercise),
  sets: v.array(snapshotSet),
  updatedAt: v.number(),
});
export type Snapshot = Infer<typeof snapshot>;

async function applySets(
  ctx: MutationCtx,
  userId: Id<"users">,
  workout: Doc<"workouts">,
  sets: Snapshot["sets"],
) {
  const existing = await workoutSetsOf(ctx, workout._id);
  const byClient = new Map(existing.map((s) => [s.clientId, s]));
  const affected = new Set<Id<"exercises">>();
  const checked = new Set<Id<"exercises">>();
  const seen = new Set<string>();

  for (const s of sets) {
    if (!checked.has(s.exerciseId)) {
      await ownedExercise(ctx, userId, s.exerciseId);
      checked.add(s.exerciseId);
    }
    seen.add(s.clientId);
    const old = byClient.get(s.clientId);
    if (!old) {
      await ctx.db.insert("workoutSets", { userId, workoutId: workout._id, ...s });
      if (s.completedAt) affected.add(s.exerciseId);
      continue;
    }
    const changed =
      old.exerciseId !== s.exerciseId ||
      old.exerciseKey !== s.exerciseKey ||
      old.order !== s.order ||
      old.setType !== s.setType ||
      old.weight !== s.weight ||
      old.reps !== s.reps ||
      old.rir !== s.rir ||
      old.completedAt !== s.completedAt;
    if (changed) {
      await ctx.db.patch(old._id, {
        exerciseId: s.exerciseId,
        exerciseKey: s.exerciseKey,
        order: s.order,
        setType: s.setType,
        weight: s.weight,
        reps: s.reps,
        rir: s.rir,
        completedAt: s.completedAt,
      });
      if (old.completedAt || s.completedAt) {
        affected.add(old.exerciseId);
        affected.add(s.exerciseId);
      }
    }
  }
  for (const old of existing) {
    if (!seen.has(old.clientId)) {
      await ctx.db.delete(old._id);
      if (old.completedAt) affected.add(old.exerciseId);
    }
  }
  return affected;
}

async function upsertActive(ctx: MutationCtx, userId: Id<"users">, snap: Snapshot) {
  let workout = await ctx.db
    .query("workouts")
    .withIndex("by_user_client", (q) => q.eq("userId", userId).eq("clientId", snap.clientId))
    .unique();
  if (workout && workout.status === "done") return { workout, stale: true };
  if (workout && workout.updatedAt > snap.updatedAt) return { workout, stale: true };

  for (const ex of snap.exercises) await ownedExercise(ctx, userId, ex.exerciseId);
  const fields = {
    routineId: snap.routineId,
    name: snap.name,
    startedAt: snap.startedAt,
    notes: snap.notes,
    exercises: snap.exercises,
    updatedAt: snap.updatedAt,
  };
  if (!workout) {
    const id = await ctx.db.insert("workouts", {
      userId,
      clientId: snap.clientId,
      status: "active",
      ...fields,
    });
    workout = (await ctx.db.get(id))!;
  } else {
    await ctx.db.patch(workout._id, fields);
  }
  const affected = await applySets(ctx, userId, workout, snap.sets);
  for (const exId of affected) await recomputePRs(ctx, userId, exId);
  return { workout, stale: false };
}

/** The in-progress workout, if any (for other devices and for crash recovery). */
export const active = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const w = await ctx.db
      .query("workouts")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
      .order("desc")
      .first();
    if (!w) return null;
    const sets = await workoutSetsOf(ctx, w._id);
    return { workout: w, sets };
  },
});

export const sync = mutation({
  args: { snapshot },
  handler: async (ctx, { snapshot: snap }) => {
    const userId = await requireUserId(ctx);
    const { workout, stale } = await upsertActive(ctx, userId, snap);
    const sets = await workoutSetsOf(ctx, workout._id);
    return {
      workoutId: workout._id,
      status: workout.status,
      stale,
      // Lets the client show PR badges as soon as a set is saved.
      prs: Object.fromEntries(sets.filter((s) => s.prs?.length).map((s) => [s.clientId, s.prs!])),
    };
  },
});

export const finish = mutation({
  args: { snapshot, endedAt: v.number() },
  handler: async (ctx, { snapshot: snap, endedAt }) => {
    const userId = await requireUserId(ctx);
    const { workout } = await upsertActive(ctx, userId, snap);
    if (workout.status === "done") return workout._id;
    // Drop sets that were never completed.
    const sets = await workoutSetsOf(ctx, workout._id);
    for (const s of sets) if (!s.completedAt) await ctx.db.delete(s._id);
    await ctx.db.patch(workout._id, { status: "done", endedAt, updatedAt: Date.now() });
    return workout._id;
  },
});

/** Throw away an in-progress workout (app only). */
export const discard = mutation({
  args: { clientId: v.string() },
  handler: async (ctx, { clientId }) => {
    const userId = await requireUserId(ctx);
    const w = await ctx.db
      .query("workouts")
      .withIndex("by_user_client", (q) => q.eq("userId", userId).eq("clientId", clientId))
      .unique();
    if (!w || w.status !== "active") return;
    const sets = await workoutSetsOf(ctx, w._id);
    const affected = new Set(sets.filter((s) => s.completedAt).map((s) => s.exerciseId));
    for (const s of sets) await ctx.db.delete(s._id);
    await ctx.db.delete(w._id);
    for (const exId of affected) await recomputePRs(ctx, userId, exId);
  },
});

/**
 * Last completed session's sets for each exercise, used for the grey
 * "last time" column and double-progression suggestions.
 */
export const lastSets = query({
  args: {
    exerciseIds: v.array(v.id("exercises")),
    excludeWorkoutId: v.optional(v.id("workouts")),
  },
  handler: async (ctx, { exerciseIds, excludeWorkoutId }) => {
    const userId = await requireUserId(ctx);
    const out: Record<string, { workoutId: Id<"workouts">; date: number; sets: { setType: Doc<"workoutSets">["setType"]; weight: number; reps: number; rir?: number }[] }> = {};
    for (const exerciseId of exerciseIds) {
      const recent = await ctx.db
        .query("workoutSets")
        .withIndex("by_user_exercise_time", (q) =>
          q.eq("userId", userId).eq("exerciseId", exerciseId).gt("completedAt", 0),
        )
        .order("desc")
        .take(40);
      let target: Id<"workouts"> | undefined;
      for (const s of recent) {
        if (s.workoutId === excludeWorkoutId) continue;
        const w = await ctx.db.get(s.workoutId);
        if (w?.status === "done") {
          target = s.workoutId;
          break;
        }
      }
      if (!target) continue;
      const sets = recent
        .filter((s) => s.workoutId === target)
        .sort((a, b) => a.order - b.order)
        .map((s) => ({ setType: s.setType, weight: s.weight, reps: s.reps, rir: s.rir }));
      out[exerciseId] = {
        workoutId: target,
        date: Math.min(...recent.filter((s) => s.workoutId === target).map((s) => s.completedAt!)),
        sets,
      };
    }
    return out;
  },
});

export const list = query({
  args: { from: v.number(), to: v.number() },
  handler: async (ctx, { from, to }) => {
    const userId = await requireUserId(ctx);
    const ws = await listWorkouts(ctx, userId, from, to);
    return await Promise.all(
      ws.map(async (w) => ({
        _id: w._id,
        name: w.name,
        startedAt: w.startedAt,
        endedAt: w.endedAt,
        summary: await summarizeWorkout(ctx, w),
      })),
    );
  },
});

export const get = query({
  args: { id: v.id("workouts") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const workout = await ownedWorkout(ctx, userId, id);
    const sets = await workoutSetsOf(ctx, id);
    const exIds = [...new Set([...workout.exercises.map((e) => e.exerciseId), ...sets.map((s) => s.exerciseId)])];
    const exercises = (await Promise.all(exIds.map((x) => ctx.db.get(x)))).filter(
      (e): e is Doc<"exercises"> => !!e,
    );
    return { workout, sets, exercises, summary: await summarizeWorkout(ctx, workout) };
  },
});

/** Edit a finished workout (app only): replace its sets and metadata. */
export const saveEdit = mutation({
  args: {
    id: v.id("workouts"),
    name: v.string(),
    notes: v.optional(v.string()),
    startedAt: v.number(),
    endedAt: v.number(),
    exercises: v.array(workoutExercise),
    sets: v.array(snapshotSet),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const w = await ownedWorkout(ctx, userId, args.id);
    if (w.status !== "done") throw new ConvexError("Only finished workouts can be edited here");
    if (args.endedAt < args.startedAt) throw new ConvexError("End must be after start");
    for (const ex of args.exercises) await ownedExercise(ctx, userId, ex.exerciseId);
    await ctx.db.patch(w._id, {
      name: args.name,
      notes: args.notes,
      startedAt: args.startedAt,
      endedAt: args.endedAt,
      exercises: args.exercises,
      updatedAt: Date.now(),
    });
    const affected = await applySets(
      ctx,
      userId,
      w,
      args.sets.filter((s) => s.completedAt),
    );
    for (const exId of affected) await recomputePRs(ctx, userId, exId);
  },
});

/** Delete a finished workout (app only — never exposed to Claude). */
export const remove = mutation({
  args: { id: v.id("workouts") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    await ownedWorkout(ctx, userId, id);
    const sets = await workoutSetsOf(ctx, id);
    const affected = new Set(sets.map((s) => s.exerciseId));
    for (const s of sets) await ctx.db.delete(s._id);
    await ctx.db.delete(id);
    for (const exId of affected) await recomputePRs(ctx, userId, exId);
  },
});
