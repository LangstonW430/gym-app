import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import {
  listWorkouts,
  nextUp,
  requireUserId,
  summarizeWorkout,
  weeklyMuscleSets,
} from "./lib/core";
import { startOfWeek } from "./lib/shared";

const DAY = 86_400_000;

export const home = query({
  args: { now: v.number(), tzOffsetMin: v.number() },
  handler: async (ctx, { now, tzOffsetMin }) => {
    const userId = await requireUserId(ctx);
    const shift = tzOffsetMin * 60_000;
    const weekStart = startOfWeek(now - shift) + shift;
    const next = await nextUp(ctx, userId);
    const thisWeek = await listWorkouts(ctx, userId, weekStart, weekStart + 7 * DAY);
    const last = (await listWorkouts(ctx, userId, 0, now, 1))[0];
    const active = await ctx.db
      .query("workouts")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
      .first();
    const prs = await ctx.db
      .query("personalRecords")
      .withIndex("by_user_achieved", (q) => q.eq("userId", userId).gte("achievedAt", now - 7 * DAY))
      .collect();
    const meaningful = prs.filter((p) => p.kind !== "reps" && p.previousValue !== undefined);
    const exNames = new Map<string, string>();
    for (const p of meaningful) {
      if (!exNames.has(p.exerciseId)) exNames.set(p.exerciseId, (await ctx.db.get(p.exerciseId))?.name ?? "?");
    }
    const recentPrs = await Promise.all(
      meaningful.map(async (p) => {
        const set = await ctx.db.get(p.setId);
        return {
          _id: p._id,
          exerciseId: p.exerciseId,
          exercise: exNames.get(p.exerciseId)!,
          kind: p.kind,
          value: p.value,
          previousValue: p.previousValue,
          weight: set?.weight ?? 0,
          reps: set?.reps ?? 0,
          achievedAt: p.achievedAt,
        };
      }),
    );
    return {
      weekStart,
      next: next
        ? {
            programName: next.program.name,
            schedule: next.program.schedule,
            routineId: next.routine._id,
            name: next.routine.name,
            exerciseCount: next.routine.items.length,
            estimatedMinutes: next.routine.estimatedMinutes,
          }
        : null,
      weekDays: thisWeek.map((w) => w.startedAt),
      lastWorkout: last
        ? { _id: last._id, name: last.name, startedAt: last.startedAt, summary: await summarizeWorkout(ctx, last) }
        : null,
      activeWorkoutId: active?._id ?? null,
      recentPrs: recentPrs.sort((a, b) => b.achievedAt - a.achievedAt),
    };
  },
});

export const weeklyMuscles = query({
  args: { from: v.number(), to: v.number(), tzOffsetMin: v.number() },
  handler: async (ctx, { from, to, tzOffsetMin }) => {
    const userId = await requireUserId(ctx);
    return await weeklyMuscleSets(ctx, userId, from, to, tzOffsetMin);
  },
});

/** Workouts per week, all time (or since `from`). */
export const consistency = query({
  args: { from: v.number(), tzOffsetMin: v.number() },
  handler: async (ctx, { from, tzOffsetMin }) => {
    const userId = await requireUserId(ctx);
    const ws = await listWorkouts(ctx, userId, from, Date.now() + DAY, 5000);
    const shift = tzOffsetMin * 60_000;
    const counts = new Map<number, number>();
    for (const w of ws) {
      const wk = startOfWeek(w.startedAt - shift) + shift;
      counts.set(wk, (counts.get(wk) ?? 0) + 1);
    }
    if (ws.length === 0) return [];
    // Fill empty weeks so gaps show as zero.
    const first = Math.min(...counts.keys());
    const last = startOfWeek(Date.now() - shift) + shift;
    const out = [];
    for (let wk = first; wk <= last; wk += 7 * DAY) {
      // DST shifts can move week starts by an hour; snap to the nearest key.
      const key = [...counts.keys()].find((k) => Math.abs(k - wk) < 2 * 3600_000);
      out.push({ weekStart: wk, workouts: key !== undefined ? counts.get(key)! : 0 });
    }
    return out;
  },
});

/** All current records with exercise names, for the Progress screen PR list. */
export const records = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const exercises = await ctx.db
      .query("exercises")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const byId = new Map<string, Doc<"exercises">>(exercises.map((e) => [e._id, e]));
    const out = [];
    for (const e of exercises) {
      const recs = await ctx.db
        .query("personalRecords")
        .withIndex("by_user_exercise", (q) => q.eq("userId", userId).eq("exerciseId", e._id))
        .collect();
      const weight = recs.find((r) => r.kind === "weight");
      const e1 = recs.find((r) => r.kind === "e1rm");
      if (!weight && !e1) continue;
      out.push({
        exerciseId: e._id,
        exercise: byId.get(e._id)!.name,
        bestWeight: weight?.value,
        bestE1rm: e1?.value,
        achievedAt: Math.max(weight?.achievedAt ?? 0, e1?.achievedAt ?? 0),
      });
    }
    return out.sort((a, b) => b.achievedAt - a.achievedAt);
  },
});
