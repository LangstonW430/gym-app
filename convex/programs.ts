import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  getActiveProgram,
  getRoutineFull,
  nextUp as computeNextUp,
  ownedProgram,
  ownedRoutine,
  requireUserId,
} from "./lib/core";

const schedule = v.array(v.union(v.literal("train"), v.literal("rest")));

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const programs = await ctx.db
      .query("programs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return programs.filter((p) => !p.archived);
  },
});

export const get = query({
  args: { id: v.id("programs") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const program = await ownedProgram(ctx, userId, id);
    const routines = await Promise.all(
      program.routineOrder.map((rid) => getRoutineFull(ctx, userId, rid)),
    );
    // Routines that belong to the program but aren't in the rotation.
    const all = await ctx.db
      .query("routines")
      .withIndex("by_program", (q) => q.eq("programId", id))
      .collect();
    const unused = all.filter((r) => !r.archived && !program.routineOrder.includes(r._id));
    return { program, routines, unused };
  },
});

export const active = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await getActiveProgram(ctx, userId);
  },
});

export const nextUp = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await computeNextUp(ctx, userId);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    schedule: v.optional(schedule),
    makeActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const current = await getActiveProgram(ctx, userId);
    const makeActive = args.makeActive ?? !current;
    if (makeActive && current) await ctx.db.patch(current._id, { isActive: false });
    return await ctx.db.insert("programs", {
      userId,
      name: args.name.trim() || "Program",
      routineOrder: [],
      schedule: args.schedule ?? ["train", "train", "train", "rest", "train", "train", "rest"],
      isActive: makeActive,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("programs"),
    name: v.optional(v.string()),
    schedule: v.optional(schedule),
    routineOrder: v.optional(v.array(v.id("routines"))),
  },
  handler: async (ctx, { id, ...rest }) => {
    const userId = await requireUserId(ctx);
    await ownedProgram(ctx, userId, id);
    if (rest.schedule && rest.schedule.length !== 7) throw new Error("Schedule needs 7 days");
    if (rest.routineOrder) {
      for (const rid of rest.routineOrder) await ownedRoutine(ctx, userId, rid);
    }
    const patch = Object.fromEntries(Object.entries(rest).filter(([, val]) => val !== undefined));
    await ctx.db.patch(id, patch);
  },
});

export const setActive = mutation({
  args: { id: v.id("programs") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    await ownedProgram(ctx, userId, id);
    const all = await ctx.db
      .query("programs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const p of all) {
      if (p.isActive !== (p._id === id)) await ctx.db.patch(p._id, { isActive: p._id === id });
    }
  },
});

export const archive = mutation({
  args: { id: v.id("programs") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    await ownedProgram(ctx, userId, id);
    await ctx.db.patch(id, { archived: true, isActive: false });
  },
});
