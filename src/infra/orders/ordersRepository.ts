import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Order } from "../../domain/types.js";

export interface OrdersRepository {
  findById(orderId: string): Order | undefined;
  save(order: Order): void;
  listByCustomer(customerId: string): Order[];
}

export function createInMemoryOrdersRepository(
  seedPath = resolve(process.cwd(), "data/orders.json"),
): OrdersRepository {
  const seed = JSON.parse(readFileSync(seedPath, "utf-8")) as Order[];
  const byId = new Map(seed.map((order) => [order.id, structuredClone(order)]));

  return {
    findById(orderId) {
      const order = byId.get(orderId);
      return order ? structuredClone(order) : undefined;
    },
    save(order) {
      byId.set(order.id, structuredClone(order));
    },
    listByCustomer(customerId) {
      return [...byId.values()]
        .filter((order) => order.customerId === customerId)
        .map((order) => structuredClone(order));
    },
  };
}
