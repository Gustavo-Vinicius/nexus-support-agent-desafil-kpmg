import { describe, expect, it } from "vitest";
import { OrderAccessDeniedError, OrderService } from "../../src/domain/orderService.js";
import { createInMemoryOrdersRepository } from "../../src/infra/orders/ordersRepository.js";

describe("OrderService", () => {
  const orders = createInMemoryOrdersRepository();
  const service = new OrderService(orders);

  it("devolve pedido do dono", () => {
    const order = service.getOwnedOrder("customer-001", "12345");
    expect(order.id).toBe("12345");
    expect(order.customerId).toBe("customer-001");
    expect(order.status).toBe("delayed");
    expect(order.estimatedDelivery).toBe("2026-11-25");
    expect(order.canCancel).toBe(true);
  });

  it("nega pedido de outro cliente sem revelar detalhes", () => {
    expect(() => service.getOwnedOrder("customer-001", "99999")).toThrow(OrderAccessDeniedError);
  });

  it("lista só pedidos do customer autenticado", () => {
    const mine = service.listMyOrders("customer-001");
    expect(mine.map((o) => o.id).sort()).toEqual(["12345", "12346"]);
    expect(service.listMyOrders("customer-002").map((o) => o.id)).toEqual(["99999"]);
  });
});

