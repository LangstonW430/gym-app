import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { createExercise, recomputePRs, requireUserId } from "./lib/core";
import { uid } from "./lib/shared";
import { setType } from "./schema";

/** Everything the user owns, for CSV/JSON export (built client-side). */
export const exportAll = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const exercises = await ctx.db.query("exercises").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    const programs = await ctx.db.query("programs").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    const routines = await ctx.db.query("routines").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    const routineExercises = (
      await Promise.all(
        routines.map((r) =>
          ctx.db.query("routineExercises").withIndex("by_routine", (q) => q.eq("routineId", r._id)).collect(),
        ),
      )
    ).flat();
    const workouts = await ctx.db
      .query("workouts")
      .withIndex("by_user_started", (q) => q.eq("userId", userId))
      .collect();
    const sets = await ctx.db
      .query("workoutSets")
      .withIndex("by_user_time", (q) => q.eq("userId", userId))
      .collect();
    const bodyweight = await ctx.db
      .query("bodyweight")
      .withIndex("by_user_date", (q) => q.eq("userId", userId))
      .collect();
    const personalRecords = await ctx.db
      .query("personalRecords")
      .withIndex("by_user_achieved", (q) => q.eq("userId", userId))
      .collect();
    const user = await ctx.db.get(userId);
    return {
      exportedAt: new Date().toISOString(),
      weightUnit: "kg",
      settings: { units: user?.units, defaultRestSec: user?.defaultRestSec, plateInventory: user?.plateInventory },
      exercises,
      programs,
      routines,
      routineExercises,
      workouts,
      sets,
      personalRecords,
      bodyweight,
    };
  },
});

const importedSet = v.object({
  exercise: v.string(),
  setType,
  weight: v.number(), // kg
  reps: v.number(),
  rir: v.optional(v.number()),
  notes: v.optional(v.string()),
});

/**
 * Import workouts parsed client-side from a Hevy or Strong CSV. Exercise names
 * are matched case-insensitively to the library; unknown names become custom
 * exercises. Workouts already imported (same source + start time) are skipped.
 */
export const importWorkouts = mutation({
  args: {
    source: v.string(),
    workouts: v.array(
      v.object({
        name: v.string(),
        startedAt: v.number(),
        endedAt: v.number(),
        notes: v.optional(v.string()),
        sets: v.array(importedSet),
      }),
    ),
  },
  handler: async (ctx, { source, workouts }) => {
    const userId = await requireUserId(ctx);
    const library = await ctx.db
      .query("exercises")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const byName = new Map<string, Id<"exercises">>(library.map((e) => [norm(e.name), e._id]));
    const affected = new Set<Id<"exercises">>();
    let imported = 0;
    let skipped = 0;
    let createdExercises = 0;

    for (const w of workouts) {
      const clientId = `import:${source}:${w.startedAt}`;
      const dup = await ctx.db
        .query("workouts")
        .withIndex("by_user_client", (q) => q.eq("userId", userId).eq("clientId", clientId))
        .unique();
      if (dup) {
        skipped++;
        continue;
      }
      const exercises: Doc<"workouts">["exercises"] = [];
      const keyFor = new Map<string, string>();
      const resolved: { exerciseId: Id<"exercises">; key: string; s: (typeof w.sets)[number] }[] = [];
      for (const s of w.sets) {
        let exerciseId = byName.get(norm(s.exercise));
        if (!exerciseId) {
          exerciseId = await createExercise(ctx, userId, {
            name: s.exercise,
            primaryMuscle: "other",
            equipment: "other",
          });
          byName.set(norm(s.exercise), exerciseId);
          createdExercises++;
        }
        let key = keyFor.get(exerciseId);
        if (!key) {
          key = uid();
          keyFor.set(exerciseId, key);
          exercises.push({ key, exerciseId, notes: s.notes || undefined });
        }
        resolved.push({ exerciseId, key, s });
      }
      const workoutId = await ctx.db.insert("workouts", {
        userId,
        clientId,
        name: w.name,
        startedAt: w.startedAt,
        endedAt: w.endedAt,
        status: "done",
        notes: w.notes,
        exercises,
        updatedAt: Date.now(),
        source,
      });
      for (let i = 0; i < resolved.length; i++) {
        const { exerciseId, key, s } = resolved[i];
        await ctx.db.insert("workoutSets", {
          userId,
          workoutId,
          exerciseId,
          exerciseKey: key,
          clientId: uid(),
          order: i,
          setType: s.setType,
          weight: s.weight,
          reps: s.reps,
          rir: s.rir,
          // Spread sets across the workout so ordering by time is stable.
          completedAt: w.startedAt + i * 1000,
        });
        affected.add(exerciseId);
      }
      imported++;
    }
    for (const exId of affected) await recomputePRs(ctx, userId, exId);
    return { imported, skipped, createdExercises };
  },
});
