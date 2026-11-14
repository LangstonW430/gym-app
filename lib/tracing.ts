import { propagateAttributes, startObservation, type LangfuseTool } from "@langfuse/tracing";
import { context, ROOT_CONTEXT, SpanStatusCode } from "@opentelemetry/api";

// One Langfuse observation per MCP tool call. Only tool args, the tool result,
// the token's DB id and the duration are recorded: never the token, the
// request URL, or headers. Without a registered tracer provider every call
// here is a no-op. Tracing failures are logged and never reach the tool.

function warn(what: string, e: unknown) {
  console.warn(`[langfuse] ${what}:`, e instanceof Error ? e.message : e);
}

export async function traceTool<R extends object>(
  toolName: string,
  args: unknown,
  tokenId: string,
  exec: () => Promise<R>,
): Promise<R> {
  let span: LangfuseTool | undefined;
  try {
    // A root context makes each call its own trace instead of a child of the
    // (unexported) Next.js request span; userId groups the traces per token.
    span = context.with(ROOT_CONTEXT, () =>
      propagateAttributes({ userId: tokenId }, () =>
        startObservation(`tool:${toolName}`, { input: args }, { asType: "tool" }),
      ),
    );
  } catch (e) {
    warn("could not start span", e);
  }

  const start = performance.now();
  let res: R | undefined;
  let thrown: unknown;
  try {
    res = await exec();
    return res;
  } catch (e) {
    thrown = e;
    throw e;
  } finally {
    const durationMs = Math.round(performance.now() - start);
    if (span) {
      try {
        const failed = thrown !== undefined || (res as { isError?: unknown } | undefined)?.isError === true;
        const statusMessage = thrown !== undefined ? String(thrown) : "Tool returned isError";
        span.update({
          output: thrown !== undefined ? { error: String(thrown) } : res,
          metadata: { tokenId, durationMs },
          ...(failed ? { level: "ERROR" as const, statusMessage } : {}),
        });
        if (failed) span.otelSpan.setStatus({ code: SpanStatusCode.ERROR, message: statusMessage });
        span.end();
      } catch (e) {
        warn("could not record span", e);
      }
    }
  }
}
