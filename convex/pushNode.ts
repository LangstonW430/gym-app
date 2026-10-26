"use node";

import { v } from "convex/values";
import webPush from "web-push";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

/** Sends one notification to every device the user registered. */
export const send = internalAction({
  args: {
    userId: v.id("users"),
    title: v.string(),
    body: v.string(),
    tag: v.string(),
    silent: v.boolean(),
  },
  handler: async (ctx, { userId, title, body, tag, silent }) => {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) {
      console.warn("VAPID keys not set; skipping push");
      return;
    }
    webPush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", pub, priv);
    const subs = await ctx.runQuery(internal.push.subscriptionsFor, { userId });
    const dead = [];
    for (const s of subs) {
      try {
        await webPush.sendNotification(
          { endpoint: s.endpoint, keys: s.keys },
          JSON.stringify({ title, body, tag, silent, url: "/workout" }),
          { TTL: 120, urgency: "high" },
        );
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(s._id);
        else console.error("push failed", status, e);
      }
    }
    if (dead.length) await ctx.runMutation(internal.push.removeDead, { ids: dead });
  },
});
