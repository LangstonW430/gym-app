import { isLangfuseSpan, LangfuseSpanProcessor, type MaskFunction } from "@langfuse/otel";
import type { SpanExporter } from "@opentelemetry/sdk-trace-base";

// Langfuse export for the MCP tool spans. Node.js only: instrumentation.ts
// loads it in the nodejs runtime, and the MCP route flushes it via after().

// Our wrapper (lib/tracing.ts) names every observation "tool:<name>". Nothing
// else is exported: Next.js and HTTP spans carry the request URL, which can
// hold the connector token as ?token=.
export function isToolSpan(otelSpan: Parameters<typeof isLangfuseSpan>[0]): boolean {
  return isLangfuseSpan(otelSpan) && otelSpan.name.startsWith("tool:");
}

// Backstop only: tool args and results never contain the token, but redact
// anything token-shaped before export in case one ever does.
const TOKEN_RE = /gt_[A-Za-z0-9_-]{16,}/g;

function redact(value: unknown): unknown {
  if (typeof value === "string") return value.replace(TOKEN_RE, "[redacted]");
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v)]));
  }
  return value;
}

const mask: MaskFunction = ({ data }) => redact(data);

export function createLangfuseSpanProcessor(opts: { exporter?: SpanExporter } = {}) {
  return new LangfuseSpanProcessor({
    // Keys come from LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_BASE_URL.
    ...opts,
    // Serverless: export each span as it ends instead of holding a batch.
    exportMode: "immediate",
    shouldExportSpan: ({ otelSpan }) => isToolSpan(otelSpan),
    mask,
  });
}

// instrumentation.ts and the route handler can be bundled as separate module
// instances, so the registered processor is shared through globalThis.
const KEY = Symbol.for("gym-tracker.langfuseSpanProcessor");
type Holder = { [KEY]?: LangfuseSpanProcessor };

export function setLangfuseSpanProcessor(p: LangfuseSpanProcessor) {
  (globalThis as Holder)[KEY] = p;
}

export async function flushLangfuse(): Promise<void> {
  try {
    await (globalThis as Holder)[KEY]?.forceFlush();
  } catch (e) {
    console.warn("[langfuse] flush failed:", e instanceof Error ? e.message : e);
  }
}
