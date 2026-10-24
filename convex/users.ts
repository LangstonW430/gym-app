import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureSeeded, getSettings, requireUserId } from "./lib/core";
import { units } from "./schema";

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const settings = await getSettings(ctx, userId);
    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      seeded: !!user.seededAt,
      pinnedExerciseIds: user.pinnedExerciseIds ?? [],
      ...settings,
    };
  },
});

/** Called once after sign-in: copies the seeded exercise library for this user. */
export const bootstrap = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    await ensureSeeded(ctx, userId);
  },
});

const plateSet = v.object({ bar: v.number(), plates: v.array(v.number()) });

export const updateSettings = mutation({
  args: {
    name: v.optional(v.string()),
    units: v.optional(units),
    defaultRestSec: v.optional(v.number()),
    plateInventory: v.optional(v.object({ lb: plateSet, kg: plateSet })),
    pinnedExerciseIds: v.optional(v.array(v.id("exercises"))),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const patch = Object.fromEntries(
      Object.entries(args).filter(([, val]) => val !== undefined),
    );
    await ctx.db.patch(userId, patch);
  },
});
