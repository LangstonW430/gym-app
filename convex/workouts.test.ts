import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

async function setup() {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert("users", { email: "me@example.com" }));
  const as = t.withIdentity({ subject: `${userId}|session1` });
  await as.mutation(api.users.bootstrap, {});
  const exercises = await as.query(api.exercises.list, {});
  const bench = exercises.find((e) => e.name === "Bench Press (Barbell)")!;
  const squat = exercises.find((e) => e.name === "Squat (Barbell)")!;
  return { t, as, userId, exercises, bench, squat };
}

type SetIn = { weight: number; reps: number; setType?: "warmup" | "working"; done?: boolean };
function snapshot(clientId: string, exerciseId: Id<"exercises">, sets: SetIn[], updatedAt = Date.now(), startedAt = Date.now()) {
  return {
    clientId,
    name: "Push",
    startedAt,
    updatedAt,
    exercises: [{ key: "k1", exerciseId, repMin: 5, repMax: 8 }],
    sets: sets.map((s, i) => ({
      clientId: `${clientId}-s${i}`,
      exerciseKey: "k1",
      exerciseId,
      order: i,
      setType: s.setType ?? ("working" as const),
      weight: s.weight,
      reps: s.reps,
      completedAt: s.done === false ? undefined : startedAt + i * 1000,
    })),
  };
}

describe("seeding", () => {
  test("copies ~150 exercises once per user", async () => {
    const { as, exercises } = await setup();
    expect(exercises.length).toBeGreaterThanOrEqual(140);
    await as.mutation(api.users.bootstrap, {});
    expect((await as.query(api.exercises.list, {})).length).toBe(exercises.length);
  });

  test("other users can't read my exercises", async () => {
    const { t, bench } = await setup();
    const other = await t.run((ctx) => ctx.db.insert("users", { email: "x@example.com" }));
    await expect(t.withIdentity({ subject: `${other}|s` }).query(api.exercises.get, { id: bench._id })).rejects.toThrow(/not found/);
  });
});

describe("workout sync", () => {
  test("is idempotent and finish drops unchecked sets", async () => {
    const { as, bench } = await setup();
    const snap = snapshot("w1", bench._id, [{ weight: 100, reps: 5 }, { weight: 100, reps: 5, done: false }]);
    await as.mutation(api.workouts.sync, { snapshot: snap });
    await as.mutation(api.workouts.sync, { snapshot: snap });
    const active = await as.query(api.workouts.active, {});
    expect(active?.sets).toHaveLength(2);

    const id = await as.mutation(api.workouts.finish, { snapshot: snap, endedAt: Date.now() + 3600_000 });
    const detail = await as.query(api.workouts.get, { id });
    expect(detail.workout.status).toBe("done");
    expect(detail.sets).toHaveLength(1);
    expect(await as.query(api.workouts.active, {})).toBeNull();
  });

  test("stale snapshots are ignored", async () => {
    const { as, bench } = await setup();
    await as.mutation(api.workouts.sync, { snapshot: snapshot("w1", bench._id, [{ weight: 100, reps: 5 }], 2000) });
    const res = await as.mutation(api.workouts.sync, { snapshot: snapshot("w1", bench._id, [{ weight: 50, reps: 5 }], 1000) });
    expect(res.stale).toBe(true);
    const active = await as.query(api.workouts.active, {});
    expect(active?.sets[0].weight).toBe(100);
  });

  test("lastSets returns the previous finished session", async () => {
    const { as, bench } = await setup();
    const day = 86_400_000;
    const s1 = snapshot("a", bench._id, [{ weight: 60, reps: 10, setType: "warmup" }, { weight: 100, reps: 8 }], 1, Date.now() - 2 * day);
    await as.mutation(api.workouts.finish, { snapshot: s1, endedAt: Date.now() - 2 * day + 3600_000 });
    const last = await as.query(api.workouts.lastSets, { exerciseIds: [bench._id] });
    expect(last[bench._id].sets.map((s) => [s.setType, s.weight, s.reps])).toEqual([
      ["warmup", 60, 10],
      ["working", 100, 8],
    ]);
  });
});

describe("personal records", () => {
  test("flags PRs at the time and recomputes after delete", async () => {
    const { as, bench } = await setup();
    const day = 86_400_000;
    const t0 = Date.now() - 10 * day;
    const w1 = await as.mutation(api.workouts.finish, {
      snapshot: snapshot("a", bench._id, [{ weight: 100, reps: 5 }], 1, t0),
      endedAt: t0 + 3600_000,
    });
    const w2 = await as.mutation(api.workouts.finish, {
      snapshot: snapshot("b", bench._id, [{ weight: 40, reps: 20, setType: "warmup" }, { weight: 105, reps: 5 }, { weight: 100, reps: 7 }], 1, t0 + day),
      endedAt: t0 + day + 3600_000,
    });
    const d2 = await as.query(api.workouts.get, { id: w2 });
    expect(d2.sets[0].prs).toBeUndefined(); // warm-ups never count
    expect(d2.sets[1].prs).toEqual(["weight", "e1rm"]);
    expect(d2.sets[2].prs).toEqual(["e1rm", "reps"]); // 100x7 beats 105x5 e1RM and 100x5 reps
    expect(d2.summary.prs).toHaveLength(2);

    let h = await as.query(api.exercises.history, { exerciseId: bench._id });
    expect(h.records.find((r) => r.kind === "weight")?.value).toBe(105);

    await as.mutation(api.workouts.remove, { id: w2 });
    h = await as.query(api.exercises.history, { exerciseId: bench._id });
    expect(h.records.find((r) => r.kind === "weight")?.value).toBe(100);
    expect(h.records.find((r) => r.kind === "weight")?.workoutId).toBe(w1);
  });
});

describe("assisted exercises", () => {
  test("less assistance is the weight PR and e1RM is skipped", async () => {
    const { as, exercises } = await setup();
    const pullup = exercises.find((e) => e.name === "Assisted Pull-Up (Machine)")!;
    expect(pullup.isAssisted).toBe(true);
    const day = 86_400_000;
    const t0 = Date.now() - 10 * day;
    await as.mutation(api.workouts.finish, {
      snapshot: snapshot("a", pullup._id, [{ weight: 30, reps: 8 }], 1, t0),
      endedAt: t0 + 3600_000,
    });
    const w2 = await as.mutation(api.workouts.finish, {
      snapshot: snapshot("b", pullup._id, [{ weight: 35, reps: 10 }, { weight: 25, reps: 6 }], 1, t0 + day),
      endedAt: t0 + day + 3600_000,
    });
    const d2 = await as.query(api.workouts.get, { id: w2 });
    expect(d2.sets[0].prs).toBeUndefined(); // more assistance is not a PR, even with more reps
    expect(d2.sets[1].prs).toEqual(["weight"]); // 25 lb of help beats 30
    const h = await as.query(api.exercises.history, { exerciseId: pullup._id });
    expect(h.records.find((r) => r.kind === "weight")?.value).toBe(25);
    expect(h.records.find((r) => r.kind === "e1rm")).toBeUndefined();
    expect(h.sessions[1].topSet).toEqual({ weight: 25, reps: 6 });
    expect(h.sessions[1].e1rm).toBe(0);
  });
});

describe("programs", () => {
  test("next up follows program order, not weekday", async () => {
    const { as, bench, squat } = await setup();
    const programId = await as.mutation(api.programs.create, { name: "UL" });
    const upper = await as.mutation(api.routines.create, {
      name: "Upper",
      programId,
      exercises: [{ exerciseId: bench._id, targetSets: 3, repMin: 5, repMax: 8 }],
    });
    const lower = await as.mutation(api.routines.create, {
      name: "Lower",
      programId,
      exercises: [{ exerciseId: squat._id, targetSets: 3, repMin: 5, repMax: 8 }],
    });
    expect((await as.query(api.programs.nextUp, {}))?.routine._id).toBe(upper);
    const snap = { ...snapshot("u1", bench._id, [{ weight: 100, reps: 5 }]), routineId: upper };
    await as.mutation(api.workouts.finish, { snapshot: snap, endedAt: Date.now() + 1 });
    expect((await as.query(api.programs.nextUp, {}))?.routine._id).toBe(lower);
  });
});
