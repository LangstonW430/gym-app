// Runs once per server instance. Registers OpenTelemetry with only the
// Langfuse span processor, which exports the MCP tool spans and nothing else
// (see lib/langfuse.ts). Tracing is optional: without keys, or if setup
// fails, nothing is registered and the app runs exactly as before.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) return;
  try {
    const { NodeTracerProvider } = await import("@opentelemetry/sdk-trace-node");
    const { createLangfuseSpanProcessor, setLangfuseSpanProcessor } = await import("./lib/langfuse");
    const processor = createLangfuseSpanProcessor();
    new NodeTracerProvider({ spanProcessors: [processor] }).register();
    setLangfuseSpanProcessor(processor);
  } catch (e) {
    console.warn("[langfuse] tracing disabled, setup failed:", e instanceof Error ? e.message : e);
  }
}
