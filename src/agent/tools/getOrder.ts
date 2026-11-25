import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { OrdersApiUnavailableError } from "../../application/errors.js";
import type { OrderService } from "../../domain/orderService.js";
import { OrderAccessDeniedError } from "../../domain/orderService.js";

export function createGetOrderTool(orderService: OrderService, userId: string) {
  return tool(
    async ({ orderId }) => {
      try {
        const order = orderService.getOwnedOrder(userId, orderId);
        return JSON.stringify(order);
      } catch (error) {
        if (error instanceof OrderAccessDeniedError) {
          return JSON.stringify({ error: "not_found_or_forbidden", orderId });
        }
        if (error instanceof OrdersApiUnavailableError) {
          return JSON.stringify({
            error: "orders_api_unavailable",
            orderId,
            message: "API de pedidos indisponível. Não invente status ou dados do pedido.",
          });
        }
        return JSON.stringify({
          error: "tool_failed",
          tool: "get_order",
          orderId,
          message: error instanceof Error ? error.message : "falha desconhecida",
        });
      }
    },
    {
      name: "get_order",
      description:
        "Consulta um pedido do usuário autenticado pelo id. Se error=orders_api_unavailable, declare indisponibilidade sem inventar dados.",
      schema: z.object({
        orderId: z.string().min(1),
      }),
    },
  );
}
