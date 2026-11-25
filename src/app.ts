import Fastify from "fastify";
import { createAuthMiddleware, parseAuthTokens } from "./api/middleware/auth.js";
import { registerChatRoutes } from "./api/routes/chat.js";
import { registerOrderRoutes } from "./api/routes/orders.js";
import { registerSessionRoutes } from "./api/routes/sessions.js";
import { registerSwagger } from "./api/swagger.js";
import { createServices, type AppServices } from "./composition.js";

export async function buildApp(services?: AppServices) {
  const app = Fastify({ logger: true });
  const wired = services ?? createServices();

  await registerSwagger(app);

  app.addHook("onRequest", createAuthMiddleware(parseAuthTokens()));

  registerChatRoutes(app, wired.chatService);
  registerSessionRoutes(app, wired.chatService);
  registerOrderRoutes(app, wired.orderService, wired.cancellationService);

  app.get(
    "/health",
    {
      schema: {
        tags: ["health"],
        summary: "Healthcheck",
        response: {
          200: {
            type: "object",
            properties: { ok: { type: "boolean" } },
            required: ["ok"],
          },
        },
      },
    },
    async () => ({ ok: true }),
  );

  return app;
}
