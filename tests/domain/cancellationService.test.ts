import { describe, expect, it } from "vitest";
import {
  CancellationNotAllowedError,
  CancellationService,
} from "../../src/domain/cancellationService.js";
import { createInMemoryOrdersRepository } from "../../src/infra/orders/ordersRepository.js";

describe("CancellationService", () => {
  it("cancela pedido elegível do dono (canCancel=true)", () => {
    const orders = createInMemoryOrdersRepository();
    const service = new CancellationService(orders);

    const result = service.requestCancellation("customer-001", "12345");

    expect(result.status).toBe("cancelled");
    const saved = orders.findById("12345");
    expect(saved?.cancellationRequestedAt).toBe(result.recordedAt);
    expect(saved?.canCancel).toBe(false);
  });

  it("bloqueia pedido delivered / canCancel=false", () => {
    const orders = createInMemoryOrdersRepository();
    const service = new CancellationService(orders);

    expect(() => service.requestCancellation("customer-001", "12346")).toThrow(
      CancellationNotAllowedError,
    );
  });
});
