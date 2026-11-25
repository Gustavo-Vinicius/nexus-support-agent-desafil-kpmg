import type { FastifyInstance } from "fastify";
import {
  ChatApplicationError,
  classifyChatFailure,
} from "../../application/errors.js";
import type { ChatService } from "../../application/chatService.js";
import { chatBodySchema } from "../schemas.js";
import { errorSchema, orderSchema } from "../swagger.js";

export function registerChatRoutes(app: FastifyInstance, chatService: ChatService) {
  app.post(
    "/chat",
    {
      schema: {
        tags: ["chat"],
        summary: "Envia mensagem ao agente de suporte",
        description:
          "Orquestra a conversa (thread = userId:sessionId). Erros de LLM/tool retornam 4xx/5xx estruturados — sem inventar resultado.",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["sessionId", "message"],
          properties: {
            sessionId: { type: "string", minLength: 1, examples: ["s1"] },
            message: {
              type: "string",
              minLength: 1,
              examples: ["Qual o status do pedido 12345?"],
            },
          },
        },
        response: {
          200: {
            type: "object",
            required: ["reply", "threadId", "orders", "citations", "toolCalls"],
            properties: {
              reply: { type: "string" },
              threadId: { type: "string", examples: ["customer-001:s1"] },
              orders: {
                type: "array",
                description:
                  "Pedidos retornados por get_order / list_orders apenas neste turno",
                items: orderSchema,
              },
              citations: {
                type: "array",
                description: "Fontes de search_knowledge usadas neste turno",
                items: {
                  type: "object",
                  required: ["source"],
                  properties: {
                    source: { type: "string" },
                    title: { type: "string" },
                  },
                },
              },
              toolCalls: {
                type: "array",
                description: "Tools invocadas pelo modelo neste turno",
                items: {
                  type: "object",
                  required: ["name"],
                  properties: {
                    name: { type: "string" },
                    args: { type: "object", additionalProperties: true },
                  },
                },
              },
              awaitingConfirmation: {
                type: "object",
                properties: {
                  orderId: { type: "string" },
                  prompt: { type: "string" },
                },
              },
            },
          },
          400: errorSchema,
          401: errorSchema,
          502: errorSchema,
          503: errorSchema,
          500: errorSchema,
        },
      },
      attachValidation: true,
    },
    async (request, reply) => {
      if (request.validationError) {
        return reply.code(400).send({
          error: "invalid_body",
          message: request.validationError.message,
        });
      }

      const parsed = chatBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
      }

      try {
        const result = await chatService.handle({
          userId: request.userId,
          sessionId: parsed.data.sessionId,
          message: parsed.data.message,
        });
        return reply.send(result);
      } catch (error) {
        const appError =
          error instanceof ChatApplicationError ? error : classifyChatFailure(error);

        request.log.warn({ err: error, code: appError.code }, "chat_failed");

        const status = appError.httpStatus as 400 | 500 | 502 | 503;
        return reply.code(status).send({
          error: appError.code,
          message: appError.exposeMessage,
        });
      }
    },
  );
}
