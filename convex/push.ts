import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { requireUserId } from "./lib/core";

// Lock-screen rest alerts via Web Push. The browser can't run a timer while the
// phone is locked, so the server schedules the "rest over" notification instead.

export const status = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const subs = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return {
      // Server-side VAPID keys; the public half is safe to hand to the browser.
      publicKey: process.env.VAPID_PUBLIC_KEY ?? null,
      devices: subs.map((s) => ({ _id: s._id, endpoint: s.endpoint, label: s.label, createdAt: s.createdAt })),
    };
  },
});

export const subscribe = mutation({
  args: {
    endpoint: v.string(),
    keys: v.object({ p256dh: v.string(), auth: v.string() }),
    label: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    if (existing) {
      if (existing.userId !== userId) throw new ConvexError("Subscription belongs to another user");
      await ctx.db.patch(existing._id, { keys: args.keys, label: args.label });
      return existing._id;
    }
    return await ctx.db.insert("pushSubscriptions", { userId, ...args, createdAt: Date.now() });
  },
});

export const unsubscribe = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .unique();
    if (row && row.userId === userId) await ctx.db.delete(row._id);
  },
});

async function clearAlert(ctx: MutationCtx, userId: Id<"users">) {
  const current = await ctx.db
    .query("restAlerts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (!current) return;
  try {
    await ctx.scheduler.cancel(current.scheduledId);
  } catch {
    // Already ran or was cancelled.
  }
  await ctx.db.delete(current._id);
}

/** Called when a rest timer starts or is adjusted: (re)schedules the push. */
export const scheduleRest = mutation({
  args: { endsAt: v.number(), title: v.string(), body: v.string(), announce: v.optional(v.boolean()) },
  handler: async (ctx, { endsAt, title, body, announce }) => {
    const userId = await requireUserId(ctx);
    const subs = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!subs) return; // No device to notify.
    await clearAlert(ctx, userId);
    if (endsAt <= Date.now()) return;
    if (announce) {
      await ctx.scheduler.runAfter(0, internal.pushNode.send, {
        userId,
        title: `Resting · ${title}`,
        body: `${body} · ends ${new Date(endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
        tag: "rest",
        silent: true,
      });
    }
    const scheduledId = await ctx.scheduler.runAt(endsAt, internal.pushNode.send, {
      userId,
      title: `Rest over · ${title}`,
      body,
      tag: "rest",
      silent: false,
    });
    await ctx.db.insert("restAlerts", { userId, endsAt, title, body, scheduledId });
  },
});

export const cancelRest = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    await clearAlert(ctx, userId);
  },
});

export const subscriptionsFor = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) =>
    await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
});

export const removeDead = internalMutation({
  args: { ids: v.array(v.id("pushSubscriptions")) },
  handler: async (ctx, { ids }) => {
    for (const id of ids) await ctx.db.delete(id);
  },
});
