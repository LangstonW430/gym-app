import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  createRoutine,
  getRoutineFull,
  ownedRoutine,
  requireUserId,
  routineItems,
  writeRoutineItems,
} from "./lib/core";

export const routineItem = v.object({
  exerciseId: v.id("exercises"),
  targetSets: v.number(),
  repMin: v.number(),
  repMax: v.number(),
  restSec: v.optional(v.number()),
  supersetGroup: v.optional(v.string()),
  notes: v.optional(v.string()),
});

export const get = query({
  args: { id: v.id("routines") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    return await getRoutineFull(ctx, userId, id);
  },
});

/** All non-archived routines, for pickers ("start a routine"). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rs = await ctx.db
      .query("routines")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rs.filter((r) => !r.archived).sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    programId: v.optional(v.id("programs")),
    notes: v.optional(v.string()),
    exercises: v.optional(v.array(routineItem)),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await createRoutine(ctx, userId, { ...args, exercises: args.exercises ?? [] });
  },
});

/** In-app editor save: rename, notes, and the full ordered exercise list. */
export const save = mutation({
  args: {
    id: v.id("routines"),
    name: v.optional(v.string()),
    notes: v.optional(v.string()),
    exercises: v.optional(v.array(routineItem)),
  },
  handler: async (ctx, { id, name, notes, exercises }) => {
    const userId = await requireUserId(ctx);
    await ownedRoutine(ctx, userId, id);
    const patch: { name?: string; notes?: string } = {};
    if (name !== undefined) patch.name = name.trim() || "Routine";
    if (notes !== undefined) patch.notes = notes;
    await ctx.db.patch(id, patch);
    if (exercises) await writeRoutineItems(ctx, userId, id, exercises);
  },
});

export const duplicate = mutation({
  args: { id: v.id("routines") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const r = await ownedRoutine(ctx, userId, id);
    const items = await routineItems(ctx, id);
    return await createRoutine(ctx, userId, {
      name: `${r.name} (copy)`,
      programId: r.programId,
      notes: r.notes,
      exercises: items.map((it) => ({
        exerciseId: it.exerciseId,
        targetSets: it.targetSets,
        repMin: it.repMin,
        repMax: it.repMax,
        restSec: it.restSec,
        supersetGroup: it.supersetGroup,
        notes: it.notes,
      })),
    });
  },
});

/** Archive instead of delete; removes it from its program's rotation. */
export const archive = mutation({
  args: { id: v.id("routines") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const r = await ownedRoutine(ctx, userId, id);
    await ctx.db.patch(id, { archived: true });
    if (r.programId) {
      const p = await ctx.db.get(r.programId);
      if (p) await ctx.db.patch(p._id, { routineOrder: p.routineOrder.filter((x) => x !== id) });
    }
  },
});
