import type { OrdersRepository } from "../infra/orders/ordersRepository.js";
import { OrderAccessDeniedError, OrderService } from "./orderService.js";
import type { CancellationResult, Order } from "./types.js";

export class CancellationNotAllowedError extends Error {
  constructor(orderId: string, reason: string) {
    super(`Cancelamento do pedido ${orderId} não permitido: ${reason}`);
    this.name = "CancellationNotAllowedError";
  }
}

export class CancellationService {
  private readonly orderService: OrderService;

  constructor(private readonly orders: OrdersRepository) {
    this.orderService = new OrderService(orders);
  }

  canCancel(order: Order): { ok: true } | { ok: false; reason: string } {
    if (order.status === "cancelled") {
      return { ok: false, reason: "pedido já cancelado" };
    }
    if (order.status === "delivered") {
      return { ok: false, reason: "pedido já entregue" };
    }
    if (!order.canCancel) {
      return { ok: false, reason: "pedido marcado como não cancelável" };
    }
    if (order.cancellationRequestedAt) {
      return { ok: false, reason: "cancelamento já solicitado" };
    }
    return { ok: true };
  }

  /** Registra solicitação após confirmação determinística (não é o LLM quem autoriza). */
  requestCancellation(
    customerId: string,
    orderId: string,
    now = new Date(),
  ): CancellationResult {
    const order = this.orderService.getOwnedOrder(customerId, orderId);
    const eligibility = this.canCancel(order);
    if (!eligibility.ok) {
      throw new CancellationNotAllowedError(orderId, eligibility.reason);
    }

    const recordedAt = now.toISOString();
    const updated: Order = {
      ...order,
      status: "cancelled",
      canCancel: false,
      cancellationRequestedAt: recordedAt,
    };
    this.orders.save(updated);

    return { orderId, status: updated.status, recordedAt };
  }
}

export { OrderAccessDeniedError };
