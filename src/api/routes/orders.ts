import type { FastifyInstance } from "fastify";
import {
  CancellationNotAllowedError,
  OrderAccessDeniedError,
  type CancellationService,
} from "../../domain/cancellationService.js";
import type { OrderService } from "../../domain/orderService.js";
import { orderIdParamsSchema } from "../schemas.js";
import { errorSchema, orderSchema } from "../swagger.js";

const orderIdParams = {
  type: "object",
  required: ["id"],
  properties: {
    id: { type: "string", minLength: 1, examples: ["12345"] },
  },
} as const;

export function registerOrderRoutes(
  app: FastifyInstance,
  orderService: OrderService,
  cancellationService: CancellationService,
) {
  app.get(
    "/orders/:id",
    {
      schema: {
        tags: ["orders"],
        summary: "Consulta pedido do usuário autenticado",
        description: "Retorna 404 se o pedido não existir ou não pertencer ao userId do token.",
        security: [{ bearerAuth: [] }],
        params: orderIdParams,
        response: {
          200: orderSchema,
          400: errorSchema,
          401: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const params = orderIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ error: "invalid_params" });
      }

      try {
        const order = orderService.getOwnedOrder(request.userId, params.data.id);
        return reply.send(order);
      } catch (error) {
        if (error instanceof OrderAccessDeniedError) {
          return reply.code(404).send({ error: "not_found" });
        }
        throw error;
      }
    },
  );

  app.post(
    "/orders/:id/cancellation-request",
    {
      schema: {
        tags: ["orders"],
        summary: "Solicita cancelamento direto (sem LLM)",
        description:
          "Aplica canCancel + registro no cancellationService. Mesmas regras usadas pela tool do agente.",
        security: [{ bearerAuth: [] }],
        params: orderIdParams,
        response: {
          201: {
            type: "object",
            required: ["orderId", "status", "recordedAt"],
            properties: {
              orderId: { type: "string" },
              status: { type: "string", enum: ["cancelled"] },
              recordedAt: { type: "string", format: "date-time" },
            },
          },
          400: errorSchema,
          401: errorSchema,
          404: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const params = orderIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ error: "invalid_params" });
      }

      try {
        const result = cancellationService.requestCancellation(request.userId, params.data.id);
        return reply.code(201).send(result);
      } catch (error) {
        if (error instanceof OrderAccessDeniedError) {
          return reply.code(404).send({ error: "not_found" });
        }
        if (error instanceof CancellationNotAllowedError) {
          return reply.code(409).send({
            error: "cancellation_not_allowed",
            message: error.message,
          });
        }
        throw error;
      }
    },
  );
}
