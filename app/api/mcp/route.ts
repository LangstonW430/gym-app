import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { buildMcpServer } from "@/lib/mcp-server";

// Remote MCP server for the claude.ai custom connector.
// Auth (personal v1): a long random token created in Profile, sent either as
// `Authorization: Bearer <token>` or as `?token=<token>` in the connector URL
// (claude.ai custom connectors don't let you set headers). Stateless: a fresh
// server per request, JSON responses, which suits serverless functions.

export const maxDuration = 30;

function tokenFrom(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return new URL(req.url).searchParams.get("token");
}

function jsonRpcError(status: number, message: string) {
  return Response.json({ jsonrpc: "2.0", error: { code: -32001, message }, id: null }, { status });
}

async function handle(req: Request): Promise<Response> {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return jsonRpcError(500, "Server is missing NEXT_PUBLIC_CONVEX_URL");
  const token = tokenFrom(req);
  if (!token) return jsonRpcError(401, "Missing token. Create a connector URL in the app's Profile screen.");

  const convex = new ConvexHttpClient(url);
  try {
    await convex.mutation(api.mcp.authenticate, { token });
  } catch {
    return jsonRpcError(401, "Invalid or revoked token.");
  }

  const server = buildMcpServer(convex, token);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    // Close after the response is produced; nothing is kept between requests.
    void server.close();
  }
}

export async function POST(req: Request) {
  return handle(req);
}

// Stateless server: no standalone SSE stream and no sessions to delete.
export async function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}

export async function DELETE() {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}
