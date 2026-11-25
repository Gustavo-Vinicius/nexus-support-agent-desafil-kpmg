import type { FastifyInstance } from "fastify";
import type { ChatService } from "../../application/chatService.js";
import { sessionIdParamsSchema } from "../schemas.js";
import { errorSchema } from "../swagger.js";

export function registerSessionRoutes(app: FastifyInstance, chatService: ChatService) {
  app.delete(
    "/sessions/:sessionId",
    {
      schema: {
        tags: ["sessions"],
        summary: "Apaga uma sessão de conversa do usuário autenticado",
        description:
          "Remove do checkpointer a thread `{userId}:{sessionId}` (histórico e " +
          "cancelamento pendente). O userId vem só do Bearer — um sessionId de " +
          "outro cliente não encontra a thread e responde 204 (idempotente).",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["sessionId"],
          properties: {
            sessionId: {
              type: "string",
              description: "UUID da sessão (validado com Zod)",
              examples: ["550e8400-e29b-41d4-a716-446655440000"],
            },
          },
        },
        response: {
          204: {
            type: "null",
            description: "Sessão apagada ou já inexistente",
          },
          400: errorSchema,
          401: errorSchema,
        },
      },
      attachValidation: true,
    },
    async (request, reply) => {
      const parsed = sessionIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "invalid_params",
          details: parsed.error.flatten(),
        });
      }

      await chatService.deleteSession(request.userId, parsed.data.sessionId);
      return reply.code(204).send();
    },
  );
}
