import type { OrdersRepository } from "../infra/orders/ordersRepository.js";
import type { Order } from "./types.js";

export class OrderAccessDeniedError extends Error {
  constructor(orderId: string) {
    super(`Pedido ${orderId} não encontrado ou sem permissão`);
    this.name = "OrderAccessDeniedError";
  }
}

export class OrderService {
  constructor(private readonly orders: OrdersRepository) {}

  /** Autorização fora do LLM: só devolve o pedido se pertencer ao customerId. */
  getOwnedOrder(customerId: string, orderId: string): Order {
    const order = this.orders.findById(orderId);
    if (!order || order.customerId !== customerId) {
      throw new OrderAccessDeniedError(orderId);
    }
    return order;
  }

  /** Lista só os pedidos do customer autenticado (nunca o catálogo global). */
  listMyOrders(customerId: string): Order[] {
    return this.orders.listByCustomer(customerId);
  }
}
