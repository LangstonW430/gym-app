import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { createExercise, exerciseSessions, ownedExercise, requireUserId } from "./lib/core";
import { equipment } from "./schema";

/** The whole library (a few hundred rows at most); the client filters it. */
export const list = query({
  args: { includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const all = await ctx.db
      .query("exercises")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return all
      .filter((e) => args.includeArchived || !e.archived)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const get = query({
  args: { id: v.id("exercises") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    return await ownedExercise(ctx, userId, id);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    primaryMuscle: v.string(),
    secondaryMuscles: v.optional(v.array(v.string())),
    equipment,
    defaultRestSec: v.optional(v.number()),
    incrementLb: v.optional(v.number()),
    incrementKg: v.optional(v.number()),
    isBodyweight: v.optional(v.boolean()),
    isAssisted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const id = await createExercise(ctx, userId, args);
    return (await ctx.db.get(id))!;
  },
});

export const update = mutation({
  args: {
    id: v.id("exercises"),
    name: v.optional(v.string()),
    primaryMuscle: v.optional(v.string()),
    secondaryMuscles: v.optional(v.array(v.string())),
    equipment: v.optional(equipment),
    defaultRestSec: v.optional(v.number()),
    incrementLb: v.optional(v.number()),
    incrementKg: v.optional(v.number()),
    isBodyweight: v.optional(v.boolean()),
    isAssisted: v.optional(v.boolean()),
    archived: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...rest }) => {
    const userId = await requireUserId(ctx);
    await ownedExercise(ctx, userId, id);
    const patch = Object.fromEntries(Object.entries(rest).filter(([, val]) => val !== undefined));
    await ctx.db.patch(id, patch);
  },
});

/** Sessions for one exercise (charts, history sheet). */
export const history = query({
  args: {
    exerciseId: v.id("exercises"),
    from: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const exercise = await ownedExercise(ctx, userId, args.exerciseId);
    const sessions = await exerciseSessions(ctx, userId, args.exerciseId, args.from ?? 0);
    const records = await ctx.db
      .query("personalRecords")
      .withIndex("by_user_exercise", (q) => q.eq("userId", userId).eq("exerciseId", args.exerciseId))
      .collect();
    return {
      exercise,
      sessions: args.limit ? sessions.slice(-args.limit) : sessions,
      records,
    };
  },
});
