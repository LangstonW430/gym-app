import "server-only";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { EQUIPMENT, MUSCLES } from "@/convex/lib/shared";

// The MCP server Claude talks to. Every tool forwards to a token-gated Convex
// function in convex/mcp.ts. There are no delete tools by design.

const READ = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

const date = z.string().describe("ISO date, e.g. 2026-10-01");
const routineItem = z.object({
  exerciseId: z.string().describe("Exercise id from list_exercises"),
  targetSets: z.number().int().min(1).max(20),
  repMin: z.number().int().min(1).max(100),
  repMax: z.number().int().min(1).max(100),
  restSec: z.number().int().min(0).max(900).optional().describe("Rest after each set; defaults to the exercise's rest time"),
  supersetGroup: z.string().max(2).optional().describe("Same letter (e.g. 'A') on consecutive exercises makes a superset"),
  notes: z.string().optional(),
});

function result(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

function errorResult(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  // Convex wraps thrown ConvexErrors; keep the human part.
  const clean = msg.replace(/^\[.*?\]\s*/, "").replace(/^.*?Uncaught ConvexError:\s*/, "").split("\n")[0];
  return { content: [{ type: "text" as const, text: `Error: ${clean}` }], isError: true };
}

export function buildMcpServer(convex: ConvexHttpClient, token: string) {
  const server = new McpServer(
    { name: "gym-tracker", version: "1.0.0" },
    {
      instructions:
        "Personal lifting tracker. Weights are returned in the user's preferred units (see the `units` field). " +
        "Before creating or updating routines, resolve exercise names to ids with list_exercises; only create a custom exercise if no match exists. " +
        "Logged workouts and sets can be read but never deleted or edited from here. update_routine archives the old version and returns the new routine id.",
    },
  );

  const run = async <T>(fn: () => Promise<T>) => {
    try {
      return result(await fn());
    } catch (e) {
      return errorResult(e);
    }
  };

  // ---- Read tools ---------------------------------------------------------

  server.registerTool(
    "list_exercises",
    {
      title: "List exercises",
      description: "Search the exercise library by name, muscle, or equipment. Returns ids to use in routines.",
      inputSchema: {
        query: z.string().optional().describe("Name search, e.g. 'incline press'"),
        muscle: z.enum(MUSCLES).optional(),
        equipment: z.enum(EQUIPMENT as [string, ...string[]]).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
      annotations: READ,
    },
    (args) => run(() => convex.query(api.mcp.listExercises, { token, ...args })),
  );

  server.registerTool(
    "get_program",
    {
      title: "Get program",
      description: "The active training program (or a given one): routines in order with their exercises, and the weekly train/rest schedule.",
      inputSchema: { programId: z.string().optional() },
      annotations: READ,
    },
    ({ programId }) => run(() => convex.query(api.mcp.getProgram, { token, programId: programId as Id<"programs"> | undefined })),
  );

  server.registerTool(
    "get_routine",
    {
      title: "Get routine",
      description: "One routine with its exercises, target sets, rep ranges, rest times, and supersets.",
      inputSchema: { routineId: z.string() },
      annotations: READ,
    },
    ({ routineId }) => run(() => convex.query(api.mcp.getRoutine, { token, routineId: routineId as Id<"routines"> })),
  );

  server.registerTool(
    "list_workouts",
    {
      title: "List workouts",
      description: "Completed workouts in a date range (default: last 30 days) with duration, working sets, volume, and PRs.",
      inputSchema: { from: date.optional(), to: date.optional() },
      annotations: READ,
    },
    (args) => run(() => convex.query(api.mcp.listWorkoutsTool, { token, ...args })),
  );

  server.registerTool(
    "get_workout",
    {
      title: "Get workout",
      description: "One workout with every set (type, weight, reps, RIR, PR flags) and notes.",
      inputSchema: { workoutId: z.string() },
      annotations: READ,
    },
    ({ workoutId }) => run(() => convex.query(api.mcp.getWorkout, { token, workoutId: workoutId as Id<"workouts"> })),
  );

  server.registerTool(
    "get_exercise_history",
    {
      title: "Get exercise history",
      description: "All sets for one exercise over a date range (default: all time), grouped by session, with estimated 1RM (Epley) per session.",
      inputSchema: { exerciseId: z.string(), from: date.optional(), to: date.optional() },
      annotations: READ,
    },
    ({ exerciseId, ...rest }) =>
      run(() => convex.query(api.mcp.getExerciseHistory, { token, exerciseId: exerciseId as Id<"exercises">, ...rest })),
  );

  server.registerTool(
    "get_progress_summary",
    {
      title: "Get progress summary",
      description: "Records set in a date range (default: last 4 weeks), weekly working sets per muscle (target 10-20), and workouts per week.",
      inputSchema: { from: date.optional(), to: date.optional() },
      annotations: READ,
    },
    (args) => run(() => convex.query(api.mcp.getProgressSummary, { token, ...args })),
  );

  server.registerTool(
    "get_bodyweight",
    {
      title: "Get bodyweight",
      description: "Bodyweight entries in a date range (YYYY-MM-DD).",
      inputSchema: { from: date.optional(), to: date.optional() },
      annotations: READ,
    },
    (args) => run(() => convex.query(api.mcp.getBodyweight, { token, ...args })),
  );

  // ---- Write tools (no deletes anywhere) -------------------------------------

  server.registerTool(
    "create_exercise",
    {
      title: "Create custom exercise",
      description: "Add a custom exercise. Check list_exercises first to avoid duplicates.",
      inputSchema: {
        name: z.string().min(1),
        primaryMuscle: z.enum(MUSCLES),
        secondaryMuscles: z.array(z.enum(MUSCLES)).optional(),
        equipment: z.enum(EQUIPMENT as [string, ...string[]]),
        defaultRestSec: z.number().int().min(0).max(900).optional(),
      },
      annotations: { ...WRITE, idempotentHint: false },
    },
    (args) =>
      run(() =>
        convex.mutation(api.mcp.createExerciseTool, {
          token,
          ...args,
          equipment: args.equipment as (typeof EQUIPMENT)[number],
        }),
      ),
  );

  server.registerTool(
    "create_routine",
    {
      title: "Create routine",
      description:
        "Create a routine from exercise ids (from list_exercises) with target sets, rep ranges, and rest. Optionally attach it to a program, which appends it to that program's rotation.",
      inputSchema: {
        name: z.string().min(1),
        programId: z.string().optional(),
        notes: z.string().optional(),
        exercises: z.array(routineItem).min(1),
      },
      annotations: WRITE,
    },
    ({ programId, exercises, ...rest }) =>
      run(() =>
        convex.mutation(api.mcp.createRoutineTool, {
          token,
          ...rest,
          programId: programId as Id<"programs"> | undefined,
          exercises: exercises.map((e) => ({ ...e, exerciseId: e.exerciseId as Id<"exercises"> })),
        }),
      ),
  );

  server.registerTool(
    "update_routine",
    {
      title: "Update routine",
      description:
        "Replace a routine's exercise list and/or rename it. The previous version is archived (not deleted) and the program rotation is pointed at the new version; use the returned routine id afterwards.",
      inputSchema: {
        routineId: z.string(),
        name: z.string().optional(),
        notes: z.string().optional(),
        exercises: z.array(routineItem).optional().describe("Full replacement list, in order"),
      },
      // Replaces the live version, but the old one is kept (archived).
      annotations: { ...WRITE, destructiveHint: true },
    },
    ({ routineId, exercises, ...rest }) =>
      run(() =>
        convex.mutation(api.mcp.updateRoutineTool, {
          token,
          ...rest,
          routineId: routineId as Id<"routines">,
          exercises: exercises?.map((e) => ({ ...e, exerciseId: e.exerciseId as Id<"exercises"> })),
        }),
      ),
  );

  server.registerTool(
    "create_program",
    {
      title: "Create program",
      description: "Create a program from routine ids (in rotation order) and a 7-day schedule (Monday first) of 'train'/'rest'.",
      inputSchema: {
        name: z.string().min(1),
        routineIds: z.array(z.string()).min(1),
        schedule: z.array(z.enum(["train", "rest"])).length(7),
        makeActive: z.boolean().optional().describe("Make this the active program (replaces the current one on Home)"),
      },
      annotations: WRITE,
    },
    ({ routineIds, ...rest }) =>
      run(() =>
        convex.mutation(api.mcp.createProgramTool, {
          token,
          ...rest,
          routineIds: routineIds as Id<"routines">[],
        }),
      ),
  );

  server.registerTool(
    "log_bodyweight",
    {
      title: "Log bodyweight",
      description: "Add (or replace) the bodyweight entry for a date.",
      inputSchema: {
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD"),
        weight: z.number().positive(),
        unit: z.enum(["lb", "kg"]).optional().describe("Defaults to the user's units"),
      },
      annotations: { ...WRITE, idempotentHint: true },
    },
    (args) => run(() => convex.mutation(api.mcp.logBodyweightTool, { token, ...args })),
  );

  return server;
}
