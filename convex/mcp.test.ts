import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { ConvexHttpClient } from "convex/browser";
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { buildMcpServer } from "../lib/mcp-server";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

vi.mock("server-only", () => ({}));

async function connect() {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert("users", { email: "me@example.com" }));
  const as = t.withIdentity({ subject: `${userId}|s` });
  await as.mutation(api.users.bootstrap, {});
  const token = await as.mutation(api.mcp.createToken, { label: "test" });
  // Bridge the MCP server's Convex client to the in-memory backend.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const fake = {
    query: (ref: any, args: any) => t.query(ref, args),
    mutation: (ref: any, args: any) => t.mutation(ref, args),
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const server = buildMcpServer(fake as unknown as ConvexHttpClient, token);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "test", version: "1" });
  await client.connect(b);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
    if (res.isError) throw new Error(res.content[0].text);
    return JSON.parse(res.content[0].text);
  };
  return { t, as, token, client, call };
}

describe("MCP connector", () => {
  test("exposes the 13 tools, none of which delete, with write annotations", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        "create_exercise", "create_program", "create_routine", "get_bodyweight", "get_exercise_history", "get_program",
        "get_progress_summary", "get_routine", "get_workout", "list_exercises", "list_workouts", "log_bodyweight", "update_routine",
      ].sort(),
    );
    expect(tools.some((t) => /delete|remove/.test(t.name))).toBe(false);
    for (const t of tools) {
      const write = t.name.startsWith("create_") || t.name.startsWith("update_") || t.name.startsWith("log_");
      expect(t.annotations?.readOnlyHint).toBe(!write);
    }
  });

  test("Claude builds a routine and program, then the app can start it", async () => {
    const { as, call } = await connect();
    const found = await call("list_exercises", { query: "bench press" });
    const bench = found.exercises.find((e: { name: string }) => e.name === "Bench Press (Barbell)");
    const row = (await call("list_exercises", { muscle: "upper back", equipment: "cable" })).exercises[0];
    expect(bench && row).toBeTruthy();

    const routine = await call("create_routine", {
      name: "Upper A",
      exercises: [
        { exerciseId: bench.id, targetSets: 3, repMin: 5, repMax: 8, restSec: 180 },
        { exerciseId: row.id, targetSets: 3, repMin: 8, repMax: 12, supersetGroup: "A" },
      ],
    });
    expect(routine.exercises).toHaveLength(2);
    const program = await call("create_program", {
      name: "Upper/Lower",
      routineIds: [routine.id],
      schedule: ["train", "rest", "train", "rest", "train", "rest", "rest"],
      makeActive: true,
    });
    const got = await call("get_program");
    expect(got.program.id).toBe(program.id);
    expect(got.program.routines[0].exercises[0].repRange).toBe("5-8");

    // The app sees it as next up.
    const next = await as.query(api.programs.nextUp, {});
    expect(next?.routine._id).toBe(routine.id);

    // update_routine archives the old version and swaps the program rotation.
    const updated = await call("update_routine", {
      routineId: routine.id,
      exercises: [{ exerciseId: bench.id, targetSets: 4, repMin: 4, repMax: 6 }],
    });
    expect(updated.previousVersionArchived).toBe(routine.id);
    const after = await call("get_program");
    expect(after.program.routines[0].id).toBe(updated.routine.id);
    expect(after.program.routines[0].exercises[0].targetSets).toBe(4);
    await expect(call("update_routine", { routineId: routine.id, name: "x" })).rejects.toThrow(/archived/);
  });

  test("bodyweight in user units, and revoked tokens stop working", async () => {
    const { as, call, token, t } = await connect();
    await call("log_bodyweight", { date: "2026-10-20", weight: 180 });
    const bw = await call("get_bodyweight", {});
    expect(bw.units).toBe("lb");
    expect(bw.entries[0].weight).toBe(180);

    const tokens = await as.query(api.mcp.listTokens, {});
    expect(JSON.stringify(tokens)).not.toContain("tokenHash");
    await as.mutation(api.mcp.revokeToken, { id: tokens[0]._id });
    await expect(t.mutation(api.mcp.authenticate, { token })).rejects.toThrow(/revoked/);
    await expect(call("get_bodyweight", {})).rejects.toThrow(/revoked/);
  });
});
