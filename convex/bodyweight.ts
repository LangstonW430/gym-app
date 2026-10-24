import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { requireUserId } from "./lib/core";

export async function logBodyweight(
  ctx: MutationCtx,
  userId: Id<"users">,
  date: string,
  weightKg: number,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ConvexError("date must be YYYY-MM-DD");
  if (!(weightKg > 20 && weightKg < 400)) throw new ConvexError("weight out of range");
  const existing = await ctx.db
    .query("bodyweight")
    .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", date))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, { weight: weightKg });
    return existing._id;
  }
  return await ctx.db.insert("bodyweight", { userId, date, weight: weightKg });
}

export const list = query({
  args: { from: v.optional(v.string()) },
  handler: async (ctx, { from }) => {
    const userId = await requireUserId(ctx);
    return await ctx.db
      .query("bodyweight")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", from ?? "0000"))
      .collect();
  },
});

/** One entry per day; logging again the same day replaces it. Weight in kg. */
export const log = mutation({
  args: { date: v.string(), weight: v.number() },
  handler: async (ctx, { date, weight }) => {
    const userId = await requireUserId(ctx);
    return await logBodyweight(ctx, userId, date, weight);
  },
});

export const remove = mutation({
  args: { id: v.id("bodyweight") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.userId !== userId) throw new ConvexError("Not found");
    await ctx.db.delete(id);
  },
});
