/** Status alinhados ao enunciado + ciclo de vida do cancelamento. */
export type OrderStatus =
  | "processing"
  | "shipped"
  | "delayed"
  | "delivered"
  | "cancelled"
  | "canceled"
  | "returned"
  | "pending_payment";

export interface OrderItem {
  sku: string;
  name: string;
  qty: number;
}

/** Fixture do enunciado: id, customerId, status, estimatedDelivery, total, canCancel. */
export interface Order {
  id: string;
  customerId: string;
  status: OrderStatus;
  estimatedDelivery: string;
  total: number;
  canCancel: boolean;
  items?: OrderItem[];
  cancellationRequestedAt?: string;
}

export interface KnowledgeChunk {
  id: string;
  title: string;
  source: string;
  text: string;
  score: number;
}

export interface CancellationResult {
  orderId: string;
  status: OrderStatus;
  recordedAt: string;
}
