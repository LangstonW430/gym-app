import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

async function setup() {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert("users", { email: "me@example.com" }));
  const as = t.withIdentity({ subject: `${userId}|s` });
  return { t, as, userId };
}

describe("rest push alerts", () => {
  test("no device registered → nothing scheduled", async () => {
    const { t, as } = await setup();
    await as.mutation(api.push.scheduleRest, { endsAt: Date.now() + 60_000, title: "Bench", body: "Set 2" });
    expect(await t.run((ctx) => ctx.db.query("restAlerts").collect())).toHaveLength(0);
  });

  test("schedules one alert per user, replaces on adjust, clears on cancel", async () => {
    const { t, as } = await setup();
    await as.mutation(api.push.subscribe, { endpoint: "https://push.example/1", keys: { p256dh: "p", auth: "a" }, label: "iPhone" });
    expect((await as.query(api.push.status)).devices).toHaveLength(1);

    const endsAt = Date.now() + 90_000;
    await as.mutation(api.push.scheduleRest, { endsAt, title: "Bench Press", body: "Set 2 of 4", announce: true });
    await as.mutation(api.push.scheduleRest, { endsAt: endsAt + 15_000, title: "Bench Press", body: "Set 2 of 4" });
    const alerts = await t.run((ctx) => ctx.db.query("restAlerts").collect());
    expect(alerts).toHaveLength(1);
    expect(alerts[0].endsAt).toBe(endsAt + 15_000);
    const scheduled = await t.run((ctx) => ctx.db.system.get(alerts[0].scheduledId));
    expect(scheduled?.state.kind).toBe("pending");
    expect(scheduled?.scheduledTime).toBe(endsAt + 15_000);

    await as.mutation(api.push.cancelRest, {});
    expect(await t.run((ctx) => ctx.db.query("restAlerts").collect())).toHaveLength(0);
    expect((await t.run((ctx) => ctx.db.system.get(alerts[0].scheduledId)))?.state.kind).toBe("canceled");

    await as.mutation(api.push.unsubscribe, { endpoint: "https://push.example/1" });
    expect((await as.query(api.push.status)).devices).toHaveLength(0);
  });
});
