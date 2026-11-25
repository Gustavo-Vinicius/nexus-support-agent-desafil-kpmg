import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { OrderService } from "../../domain/orderService.js";

/**
 * Lista pedidos do userId autenticado (contexto confiável).
 * O LLM não passa customerId — evita spoofing de identidade.
 */
export function createListOrdersTool(orderService: OrderService, userId: string) {
  return tool(
    async () => {
      try {
        const orders = orderService.listMyOrders(userId);
        return JSON.stringify({
          count: orders.length,
          orders,
        });
      } catch (error) {
        return JSON.stringify({
          error: "tool_failed",
          tool: "list_orders",
          message: error instanceof Error ? error.message : "falha desconhecida",
        });
      }
    },
    {
      name: "list_orders",
      description:
        "Lista os pedidos do usuário autenticado. Use para 'quantos pedidos', 'meus pedidos', 'liste os pedidos'. Não exige orderId e não aceita customerId.",
      schema: z.object({}),
    },
  );
}
