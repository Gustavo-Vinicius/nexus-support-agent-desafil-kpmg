import type { FastifyReply, FastifyRequest } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    /** customerId confiável (auth mock). Nunca vem do LLM. */
    userId: string;
  }
}

/** Auth mock: Bearer token → customerId via mapa estático (env AUTH_TOKENS). */
export function createAuthMiddleware(tokenMap: Map<string, string>) {
  return async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
    const path = request.url.split("?")[0] ?? "";
    if (path === "/health" || path.startsWith("/documentation")) return;

    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "missing_bearer_token" });
    }

    const token = header.slice("Bearer ".length).trim();
    const userId = tokenMap.get(token);
    if (!userId) {
      return reply.code(401).send({ error: "invalid_token" });
    }

    request.userId = userId;
  };
}

export function parseAuthTokens(
  raw = process.env.AUTH_TOKENS ?? "customer-001:tok_a,customer-002:tok_b",
) {
  const map = new Map<string, string>();
  for (const pair of raw.split(",")) {
    const [customerId, token] = pair.split(":").map((s) => s.trim());
    if (customerId && token) map.set(token, customerId);
  }
  return map;
}
