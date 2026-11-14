import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { context, trace } from "@opentelemetry/api";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import type { ConvexHttpClient } from "convex/browser";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createLangfuseSpanProcessor } from "../lib/langfuse";
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
  const { tokenId } = await t.mutation(api.mcp.authenticate, { token });
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const fake = {
    query: (ref: any, args: any) => t.query(ref, args),
    mutation: (ref: any, args: any) => t.mutation(ref, args),
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const server = buildMcpServer(fake as unknown as ConvexHttpClient, token, tokenId);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "test", version: "1" });
  await client.connect(b);
  const call = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args });
  return { as, token, tokenId, call };
}

// The production setup from instrumentation.ts, with an in-memory exporter
// standing in for the Langfuse OTLP endpoint.
function enableTracing() {
  const exporter = new InMemorySpanExporter();
  const processor = createLangfuseSpanProcessor({ exporter });
  new NodeTracerProvider({ spanProcessors: [processor] }).register();
  return { exporter, processor };
}

afterEach(() => {
  trace.disable();
  context.disable();
});

const CALLS: [string, Record<string, unknown>][] = [
  ["list_exercises", { query: "bench press", limit: 5 }],
  ["get_bodyweight", {}],
  ["get_routine", { routineId: "not-a-real-id" }], // isError result
];

describe("MCP tool tracing", () => {
  test("tool return values are identical with tracing on", async () => {
    const { as, call } = await connect();
    await as.mutation(api.bodyweight.log, { date: "2026-10-01", weight: 80 });

    const off = [];
    for (const [name, args] of CALLS) off.push(await call(name, args));

    const { exporter, processor } = enableTracing();
    const on = [];
    for (const [name, args] of CALLS) on.push(await call(name, args));
    await processor.forceFlush();

    expect(on).toEqual(off);
    expect(off[2].isError).toBe(true);
    // Tracing was really on: one exported span per call.
    expect(exporter.getFinishedSpans().map((s) => s.name)).toEqual(CALLS.map(([n]) => `tool:${n}`));
  });

  test("the exported span holds the call but no token, and request spans are not exported", async () => {
    const { token, tokenId, call } = await connect();
    expect(token.startsWith("gt_")).toBe(true);
    const { exporter, processor } = enableTracing();

    // Stand-in for the Next.js request span, which carries the URL (and so the token).
    const tracer = trace.getTracer("next.js");
    await tracer.startActiveSpan("POST /api/mcp", async (span) => {
      span.setAttribute("http.url", `https://example.com/api/mcp?token=${token}`);
      await call("list_exercises", { query: "squat", limit: 3 });
      await call("get_routine", { routineId: "not-a-real-id" });
      span.end();
    });
    await processor.forceFlush();

    const spans = exporter.getFinishedSpans();
    expect(spans.map((s) => s.name)).toEqual(["tool:list_exercises", "tool:get_routine"]);

    const [ok, failed] = spans;
    expect(ok.parentSpanContext).toBeUndefined();
    expect(ok.attributes["langfuse.observation.input"]).toBe(JSON.stringify({ query: "squat", limit: 3 }));
    expect(ok.attributes["user.id"]).toBe(tokenId);
    // Metadata values are exported JSON-encoded.
    const meta = (k: string) => JSON.parse(String(ok.attributes[`langfuse.observation.metadata.${k}`]));
    expect(meta("tokenId")).toBe(tokenId);
    expect(meta("durationMs")).toBeGreaterThanOrEqual(0);
    expect(ok.attributes["langfuse.observation.level"]).toBeUndefined();
    expect(failed.attributes["langfuse.observation.level"]).toBe("ERROR");

    const exported = JSON.stringify(
      spans.map((s) => ({ name: s.name, attributes: s.attributes, events: s.events, status: s.status, resource: s.resource.attributes })),
    );
    expect(exported).not.toContain("gt_");
  });
});
