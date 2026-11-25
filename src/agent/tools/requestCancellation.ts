import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { interrupt } from "@langchain/langgraph";
import { OrdersApiUnavailableError } from "../../application/errors.js";
import type { CancellationService } from "../../domain/cancellationService.js";
import {
  CancellationNotAllowedError,
  OrderAccessDeniedError,
} from "../../domain/cancellationService.js";

/**
 * Adapter fino: valida args, interrompe para confirmação determinística
 * e só então chama o cancellationService.
 */
export function createRequestCancellationTool(
  cancellationService: CancellationService,
  userId: string,
) {
  return tool(
    async ({ orderId }) => {
      const confirmation = interrupt({
        type: "cancellation_confirmation",
        orderId,
        message: `Confirma o cancelamento do pedido ${orderId}? Responda sim ou não.`,
      });

      const confirmed =
        typeof confirmation === "object" &&
        confirmation !== null &&
        "confirmed" in confirmation &&
        Boolean((confirmation as { confirmed: unknown }).confirmed);

      if (!confirmed) {
        return JSON.stringify({ status: "aborted", orderId });
      }

      try {
        const result = cancellationService.requestCancellation(userId, orderId);
        return JSON.stringify(result);
      } catch (error) {
        if (
          error instanceof OrderAccessDeniedError ||
          error instanceof CancellationNotAllowedError
        ) {
          return JSON.stringify({ error: error.message, orderId });
        }
        if (error instanceof OrdersApiUnavailableError) {
          return JSON.stringify({
            error: "orders_api_unavailable",
            orderId,
            message: "API de pedidos indisponível. Cancelamento não registrado.",
          });
        }
        return JSON.stringify({
          error: "tool_failed",
          tool: "request_cancellation",
          orderId,
          message: error instanceof Error ? error.message : "falha desconhecida",
        });
      }
    },
    {
      name: "request_cancellation",
      description:
        "Solicita cancelamento de um pedido. O sistema pedirá confirmação ao usuário antes de registrar.",
      schema: z.object({
        orderId: z.string().min(1),
      }),
    },
  );
}
