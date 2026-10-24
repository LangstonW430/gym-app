// Functions behind the Claude connector (/api/mcp on Vercel).
//
// Each MCP-facing function takes the raw connector token, hashes it, and acts
// as the token's owner. There is deliberately NO function here that deletes
// workouts or sets: logged history can't be touched from the connector.
// Routine edits archive the old version instead of overwriting it.

import { sha256 } from "@oslojs/crypto/sha2";
import { encodeBase64urlNoPadding, encodeHexLowerCase } from "@oslojs/encoding";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { logBodyweight } from "./bodyweight";
import {
  createExercise,
  createRoutine,
  exerciseSessions,
  getActiveProgram,
  getRoutineFull,
  getSettings,
  listWorkouts,
  ownedProgram,
  ownedRoutine,
  ownedWorkout,
  requireUserId,
  routineItems,
  summarizeWorkout,
  weeklyMuscleSets,
  workoutSetsOf,
  writeRoutineItems,
} from "./lib/core";
import { fromDisplay, toDisplay, type Units } from "./lib/shared";
import { routineItem } from "./routines";
import { equipment, units } from "./schema";

const TOKEN_PREFIX = "gt_";

function hashToken(token: string): string {
  return encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
}

// ---------------------------------------------------------------------------
// Token management (signed-in app user, Profile screen)

export const createToken = mutation({
  args: { label: v.string() },
  handler: async (ctx, { label }) => {
    const userId = await requireUserId(ctx);
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = TOKEN_PREFIX + encodeBase64urlNoPadding(bytes);
    await ctx.db.insert("mcpTokens", {
      userId,
      tokenHash: hashToken(token),
      label: label.trim() || "Claude",
      scopes: ["read", "write"],
      createdAt: Date.now(),
    });
    // Shown once; only the hash is stored.
    return token;
  },
});

export const listTokens = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("mcpTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows.map((r) => ({
      _id: r._id,
      label: r.label,
      scopes: r.scopes,
      createdAt: r.createdAt,
      lastUsedAt: r.lastUsedAt,
      revokedAt: r.revokedAt,
    }));
  },
});

export const revokeToken = mutation({
  args: { id: v.id("mcpTokens") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.userId !== userId) throw new ConvexError("Not found");
    await ctx.db.patch(id, { revokedAt: Date.now() });
  },
});

// ---------------------------------------------------------------------------
// Token auth

async function tokenUser(ctx: QueryCtx | MutationCtx, token: string, scope: "read" | "write") {
  if (!token.startsWith(TOKEN_PREFIX)) throw new ConvexError("Invalid token");
  const row = await ctx.db
    .query("mcpTokens")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", hashToken(token)))
    .unique();
  if (!row || row.revokedAt) throw new ConvexError("Invalid or revoked token");
  if (!row.scopes.includes(scope)) throw new ConvexError(`Token lacks ${scope} scope`);
  return { userId: row.userId, tokenRow: row };
}

/** Called once per MCP request: validates the token and records lastUsedAt. */
export const authenticate = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const { tokenRow } = await tokenUser(ctx, token, "read");
    if (!tokenRow.lastUsedAt || Date.now() - tokenRow.lastUsedAt > 60_000) {
      await ctx.db.patch(tokenRow._id, { lastUsedAt: Date.now() });
    }
    return { ok: true };
  },
});

// ---------------------------------------------------------------------------
// Formatting: compact JSON, ISO dates, weights in the user's units.

const iso = (ts: number | undefined) => (ts ? new Date(ts).toISOString() : undefined);
const isoDate = (ts: number) => new Date(ts).toISOString().slice(0, 10);
const w = (kg: number, u: Units) => toDisplay(kg, u);

function parseDate(s: string | undefined, fallback: number): number {
  if (!s) return fallback;
  const t = Date.parse(s);
  if (Number.isNaN(t)) throw new ConvexError(`Bad date: ${s}`);
  return t;
}

function fmtExercise(e: Doc<"exercises">, u: Units) {
  return {
    id: e._id,
    name: e.name,
    primaryMuscle: e.primaryMuscle,
    secondaryMuscles: e.secondaryMuscles,
    equipment: e.equipment,
    defaultRestSec: e.defaultRestSec,
    increment: u === "kg" ? e.incrementKg : e.incrementLb,
    isBodyweight: e.isBodyweight || undefined,
    isCustom: e.isCustom || undefined,
  };
}

async function fmtRoutine(ctx: QueryCtx | MutationCtx, userId: Id<"users">, id: Id<"routines">) {
  const r = await getRoutineFull(ctx, userId, id);
  return {
    id: r._id,
    name: r.name,
    notes: r.notes,
    archived: r.archived || undefined,
    estimatedMinutes: r.estimatedMinutes,
    exercises: r.items.map((it) => ({
      exerciseId: it.exerciseId,
      exercise: it.exercise?.name,
      targetSets: it.targetSets,
      repRange: `${it.repMin}-${it.repMax}`,
      restSec: it.restSec,
      supersetGroup: it.supersetGroup,
      notes: it.notes,
    })),
  };
}

// ---------------------------------------------------------------------------
// Read tools

export const listExercises = query({
  args: {
    token: v.string(),
    query: v.optional(v.string()),
    muscle: v.optional(v.string()),
    equipment: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId } = await tokenUser(ctx, args.token, "read");
    const { units: u } = await getSettings(ctx, userId);
    let rows: Doc<"exercises">[];
    if (args.query) {
      rows = await ctx.db
        .query("exercises")
        .withSearchIndex("search_name", (q) => q.search("name", args.query!).eq("userId", userId))
        .take(100);
    } else {
      rows = await ctx.db
        .query("exercises")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
    }
    const muscle = args.muscle?.toLowerCase();
    const eq = args.equipment?.toLowerCase();
    const filtered = rows.filter(
      (e) =>
        !e.archived &&
        (!muscle || e.primaryMuscle === muscle || e.secondaryMuscles.includes(muscle)) &&
        (!eq || e.equipment === eq),
    );
    return {
      units: u,
      exercises: filtered.slice(0, args.limit ?? 50).map((e) => fmtExercise(e, u)),
      total: filtered.length,
    };
  },
});

export const getProgram = query({
  args: { token: v.string(), programId: v.optional(v.id("programs")) },
  handler: async (ctx, args) => {
    const { userId } = await tokenUser(ctx, args.token, "read");
    const program = args.programId
      ? await ownedProgram(ctx, userId, args.programId)
      : await getActiveProgram(ctx, userId);
    const all = await ctx.db
      .query("programs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const others = all
      .filter((p) => !p.archived && p._id !== program?._id)
      .map((p) => ({ id: p._id, name: p.name }));
    if (!program) return { program: null, otherPrograms: others };
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return {
      program: {
        id: program._id,
        name: program.name,
        isActive: program.isActive,
        weeklySchedule: program.schedule.map((d, i) => `${days[i]}: ${d}`),
        note: "Routines run in order on 'train' days; a missed day doesn't skip a routine.",
        routines: await Promise.all(program.routineOrder.map((id) => fmtRoutine(ctx, userId, id))),
      },
      otherPrograms: others,
    };
  },
});

export const getRoutine = query({
  args: { token: v.string(), routineId: v.id("routines") },
  handler: async (ctx, args) => {
    const { userId } = await tokenUser(ctx, args.token, "read");
    return await fmtRoutine(ctx, userId, args.routineId);
  },
});

export const listWorkoutsTool = query({
  args: { token: v.string(), from: v.optional(v.string()), to: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { userId } = await tokenUser(ctx, args.token, "read");
    const { units: u } = await getSettings(ctx, userId);
    const to = parseDate(args.to, Date.now()) + 86_399_999;
    const from = parseDate(args.from, to - 30 * 86_400_000);
    const ws = await listWorkouts(ctx, userId, from, to, 200);
    return {
      units: u,
      workouts: await Promise.all(
        ws.map(async (wk) => {
          const s = await summarizeWorkout(ctx, wk);
          return {
            id: wk._id,
            name: wk.name,
            startedAt: iso(wk.startedAt),
            durationMin: s.durationSec ? Math.round(s.durationSec / 60) : undefined,
            workingSets: s.workingSets,
            volume: w(s.volumeKg, u),
            prs: s.prs.map((p) => `${p.exercise}: ${w(p.weight, u)}x${p.reps} (${p.kinds.join("+")})`),
          };
        }),
      ),
    };
  },
});

export const getWorkout = query({
  args: { token: v.string(), workoutId: v.id("workouts") },
  handler: async (ctx, args) => {
    const { userId } = await tokenUser(ctx, args.token, "read");
    const { units: u } = await getSettings(ctx, userId);
    const wk = await ownedWorkout(ctx, userId, args.workoutId);
    const sets = await workoutSetsOf(ctx, wk._id);
    const summary = await summarizeWorkout(ctx, wk);
    return {
      units: u,
      id: wk._id,
      name: wk.name,
      status: wk.status,
      startedAt: iso(wk.startedAt),
      endedAt: iso(wk.endedAt),
      notes: wk.notes,
      volume: w(summary.volumeKg, u),
      exercises: await Promise.all(
        wk.exercises.map(async (slot) => ({
          exerciseId: slot.exerciseId,
          exercise: (await ctx.db.get(slot.exerciseId))?.name,
          notes: slot.notes,
          sets: sets
            .filter((s) => s.exerciseKey === slot.key)
            .map((s) => ({
              type: s.setType,
              weight: w(s.weight, u),
              reps: s.reps,
              rir: s.rir,
              done: !!s.completedAt,
              pr: s.prs,
            })),
        })),
      ),
    };
  },
});

export const getExerciseHistory = query({
  args: {
    token: v.string(),
    exerciseId: v.id("exercises"),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await tokenUser(ctx, args.token, "read");
    const { units: u } = await getSettings(ctx, userId);
    const ex = await ctx.db.get(args.exerciseId);
    if (!ex || ex.userId !== userId) throw new ConvexError("Exercise not found");
    const sessions = await exerciseSessions(
      ctx,
      userId,
      args.exerciseId,
      parseDate(args.from, 0),
      parseDate(args.to, Date.now()) + 86_399_999,
    );
    const records = await ctx.db
      .query("personalRecords")
      .withIndex("by_user_exercise", (q) => q.eq("userId", userId).eq("exerciseId", args.exerciseId))
      .collect();
    return {
      units: u,
      exercise: ex.name,
      records: {
        bestWeight: records.find((r) => r.kind === "weight")?.value,
        bestE1rm: records.find((r) => r.kind === "e1rm")?.value,
      },
      sessions: sessions.map((s) => ({
        date: isoDate(s.date),
        workoutId: s.workoutId,
        e1rm: w(s.e1rm, u),
        sets: s.sets.map(
          (x) => `${x.setType === "working" ? "" : x.setType + " "}${w(x.weight, u)}x${x.reps}${x.rir !== undefined ? ` @RIR${x.rir}` : ""}`,
        ),
      })),
    };
  },
});

export const getProgressSummary = query({
  args: {
    token: v.string(),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await tokenUser(ctx, args.token, "read");
    const { units: u } = await getSettings(ctx, userId);
    const to = parseDate(args.to, Date.now()) + 86_399_999;
    const from = parseDate(args.from, to - 28 * 86_400_000);
    const prs = await ctx.db
      .query("personalRecords")
      .withIndex("by_user_achieved", (q) => q.eq("userId", userId).gte("achievedAt", from).lte("achievedAt", to))
      .collect();
    const names = new Map<string, string>();
    const prOut = [];
    for (const p of prs) {
      if (p.kind === "reps") continue;
      if (!names.has(p.exerciseId)) names.set(p.exerciseId, (await ctx.db.get(p.exerciseId))?.name ?? "?");
      prOut.push({
        exercise: names.get(p.exerciseId),
        kind: p.kind,
        value: w(p.value, u),
        previous: p.previousValue !== undefined ? w(p.previousValue, u) : undefined,
        date: isoDate(p.achievedAt),
      });
    }
    const weekly = await weeklyMuscleSets(ctx, userId, from, to);
    const workouts = await listWorkouts(ctx, userId, from, to, 1000);
    const weeks = Math.max(1, (to - from) / (7 * 86_400_000));
    return {
      units: u,
      range: { from: isoDate(from), to: isoDate(to) },
      workouts: workouts.length,
      workoutsPerWeek: Number((workouts.length / weeks).toFixed(1)),
      currentRecordsSetInRange: prOut,
      weeklySetsPerMuscle: weekly.map((wk) => ({
        weekOf: isoDate(wk.weekStart),
        sets: wk.muscles,
      })),
      note: "Weekly sets count working sets: 1 for the primary muscle, 0.5 for each secondary. Target band is 10-20.",
    };
  },
});

export const getBodyweight = query({
  args: { token: v.string(), from: v.optional(v.string()), to: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { userId } = await tokenUser(ctx, args.token, "read");
    const { units: u } = await getSettings(ctx, userId);
    const rows = await ctx.db
      .query("bodyweight")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).gte("date", args.from ?? "0000").lte("date", args.to ?? "9999"),
      )
      .collect();
    return { units: u, entries: rows.map((r) => ({ date: r.date, weight: w(r.weight, u) })) };
  },
});

// ---------------------------------------------------------------------------
// Write tools (no deletes)

export const createExerciseTool = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    primaryMuscle: v.string(),
    secondaryMuscles: v.optional(v.array(v.string())),
    equipment,
    defaultRestSec: v.optional(v.number()),
  },
  handler: async (ctx, { token, ...args }) => {
    const { userId } = await tokenUser(ctx, token, "write");
    const { units: u } = await getSettings(ctx, userId);
    const id = await createExercise(ctx, userId, {
      ...args,
      primaryMuscle: args.primaryMuscle.toLowerCase(),
      secondaryMuscles: args.secondaryMuscles?.map((m) => m.toLowerCase()),
    });
    return fmtExercise((await ctx.db.get(id))!, u);
  },
});

export const createRoutineTool = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    programId: v.optional(v.id("programs")),
    notes: v.optional(v.string()),
    exercises: v.array(routineItem),
  },
  handler: async (ctx, { token, ...args }) => {
    const { userId } = await tokenUser(ctx, token, "write");
    const id = await createRoutine(ctx, userId, args);
    return await fmtRoutine(ctx, userId, id);
  },
});

/** Archives the current version and creates a new one in its place. */
export const updateRoutineTool = mutation({
  args: {
    token: v.string(),
    routineId: v.id("routines"),
    name: v.optional(v.string()),
    notes: v.optional(v.string()),
    exercises: v.optional(v.array(routineItem)),
  },
  handler: async (ctx: MutationCtx, { token, routineId, ...args }) => {
    const { userId } = await tokenUser(ctx, token, "write");
    const old = await ownedRoutine(ctx, userId, routineId);
    if (old.archived) throw new ConvexError("That routine version is archived; use get_program for current ids");
    const oldItems = await routineItems(ctx, routineId);
    const newId = await ctx.db.insert("routines", {
      userId,
      programId: old.programId,
      name: args.name?.trim() || old.name,
      notes: args.notes ?? old.notes,
      archived: false,
    });
    await writeRoutineItems(
      ctx,
      userId,
      newId,
      args.exercises ??
        oldItems.map((it) => ({
          exerciseId: it.exerciseId,
          targetSets: it.targetSets,
          repMin: it.repMin,
          repMax: it.repMax,
          restSec: it.restSec,
          supersetGroup: it.supersetGroup,
          notes: it.notes,
        })),
    );
    await ctx.db.patch(routineId, { archived: true, supersededBy: newId });
    // Keep the program rotation pointing at the live version.
    const programs = await ctx.db
      .query("programs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const p of programs) {
      if (p.routineOrder.includes(routineId)) {
        await ctx.db.patch(p._id, {
          routineOrder: p.routineOrder.map((x) => (x === routineId ? newId : x)),
        });
      }
    }
    return { previousVersionArchived: routineId, routine: await fmtRoutine(ctx, userId, newId) };
  },
});

export const createProgramTool = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    routineIds: v.array(v.id("routines")),
    schedule: v.array(v.union(v.literal("train"), v.literal("rest"))),
    makeActive: v.optional(v.boolean()),
  },
  handler: async (ctx, { token, ...args }) => {
    const { userId } = await tokenUser(ctx, token, "write");
    if (args.schedule.length !== 7) throw new ConvexError("schedule needs 7 entries, Monday first");
    for (const id of args.routineIds) {
      const r = await ownedRoutine(ctx, userId, id);
      if (r.archived) throw new ConvexError(`Routine ${id} is archived`);
    }
    const makeActive = args.makeActive ?? false;
    if (makeActive) {
      const current = await getActiveProgram(ctx, userId);
      if (current) await ctx.db.patch(current._id, { isActive: false });
    }
    const programId = await ctx.db.insert("programs", {
      userId,
      name: args.name,
      routineOrder: args.routineIds,
      schedule: args.schedule,
      isActive: makeActive,
    });
    // Attach routines that don't belong to a program yet.
    for (const id of args.routineIds) {
      const r = await ctx.db.get(id);
      if (r && !r.programId) await ctx.db.patch(id, { programId });
    }
    return { id: programId, name: args.name, isActive: makeActive, routineIds: args.routineIds };
  },
});

export const logBodyweightTool = mutation({
  args: {
    token: v.string(),
    date: v.string(),
    weight: v.number(),
    unit: v.optional(units),
  },
  handler: async (ctx, { token, date, weight, unit }) => {
    const { userId } = await tokenUser(ctx, token, "write");
    const { units: u } = await getSettings(ctx, userId);
    const kg = fromDisplay(weight, unit ?? u);
    await logBodyweight(ctx, userId, date, kg);
    return { date, weight: toDisplay(kg, u), units: u };
  },
});
