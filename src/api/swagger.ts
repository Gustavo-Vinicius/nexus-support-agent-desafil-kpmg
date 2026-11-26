import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";

export async function registerSwagger(app: FastifyInstance) {
  await app.register(swagger, {
    openapi: {
      openapi: "3.0.3",
      info: {
        title: "Nexus Support Agent API",
        description:
          "API do agente de suporte. Identidade via Bearer token (auth mock). O LLM não autoriza — posse e cancelamento ficam nos services.",
        version: "1.0.0",
      },
      servers: [{ url: "http://localhost:3000", description: "local" }],
      tags: [
        { name: "chat", description: "Conversa com o agente LangGraph" },
        {
          name: "sessions",
          description: "Gestão de sessões (thread = userId:sessionId no checkpointer)",
        },
        { name: "orders", description: "Consultas e cancelamento determinísticos" },
        { name: "health", description: "Healthcheck" },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "token",
            description: "Tokens mock: `tok_a` (customer-001), `tok_b` (customer-002)",
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/documentation",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
    },
  });
}

export const errorSchema = {
  type: "object",
  properties: {
    error: { type: "string" },
    message: { type: "string" },
    details: { type: "object", additionalProperties: true },
  },
  required: ["error"],
} as const;

export const orderSchema = {
  type: "object",
  properties: {
    id: { type: "string", examples: ["12345"] },
    customerId: { type: "string", examples: ["customer-001"] },
    status: {
      type: "string",
      enum: [
        "processing",
        "shipped",
        "delayed",
        "delivered",
        "cancelled",
        "canceled",
        "returned",
        "pending_payment",
      ],
    },
    estimatedDelivery: { type: "string", examples: ["2026-11-25"] },
    total: { type: "number", examples: [299.9] },
    canCancel: { type: "boolean" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sku: { type: "string" },
          name: { type: "string" },
          qty: { type: "number" },
        },
        required: ["sku", "name", "qty"],
      },
    },
    cancellationRequestedAt: { type: "string", format: "date-time" },
  },
  required: ["id", "customerId", "status", "estimatedDelivery", "total", "canCancel"],
} as const;
