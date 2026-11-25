import type { AIMessage, BaseMessage } from "@langchain/core/messages";
import type { Order } from "../domain/types.js";

export interface ChatCitation {
  source: string;
  title?: string;
}

export interface ChatToolCall {
  name: string;
  args?: Record<string, unknown>;
}

export interface TurnSideData {
  orders: Order[];
  citations: ChatCitation[];
  toolCalls: ChatToolCall[];
}

/** Mensagens geradas após a última HumanMessage (turno atual). */
export function getCurrentTurnMessages(messages: readonly BaseMessage[]): BaseMessage[] {
  let lastHumanIdx = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]!._getType() === "human") {
      lastHumanIdx = i;
      break;
    }
  }
  if (lastHumanIdx < 0) return [];
  return messages.slice(lastHumanIdx + 1);
}

export function emptyTurnSideData(): TurnSideData {
  return { orders: [], citations: [], toolCalls: [] };
}

/** Extrai pedidos, citações e tool calls só das mensagens do turno atual. */
export function extractTurnSideData(messages: readonly BaseMessage[]): TurnSideData {
  const turn = getCurrentTurnMessages(messages);
  const ordersById = new Map<string, Order>();
  const citationsBySource = new Map<string, ChatCitation>();
  const toolCalls: ChatToolCall[] = [];

  for (const message of turn) {
    if (message._getType() === "ai") {
      const ai = message as AIMessage;
      for (const call of ai.tool_calls ?? []) {
        toolCalls.push({
          name: call.name,
          args:
            call.args && typeof call.args === "object"
              ? (call.args as Record<string, unknown>)
              : undefined,
        });
      }
      continue;
    }

    if (message._getType() !== "tool") continue;

    const name =
      typeof (message as { name?: string }).name === "string"
        ? (message as { name: string }).name
        : "";
    const raw =
      typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content ?? "");

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }

    if (name === "get_order") {
      const order = asOrder(parsed);
      if (order) ordersById.set(order.id, order);
      continue;
    }

    if (name === "list_orders") {
      const list = asOrderList(parsed);
      for (const order of list) {
        ordersById.set(order.id, order);
      }
      continue;
    }

    if (name === "search_knowledge") {
      for (const citation of asCitations(parsed)) {
        citationsBySource.set(citation.source, citation);
      }
    }
  }

  return {
    orders: [...ordersById.values()],
    citations: [...citationsBySource.values()],
    toolCalls,
  };
}

function asOrder(value: unknown): Order | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  if (typeof o.error === "string") return null;
  if (typeof o.id !== "string") return null;
  if (typeof o.customerId !== "string") return null;
  if (typeof o.status !== "string") return null;
  if (typeof o.estimatedDelivery !== "string") return null;
  if (typeof o.total !== "number") return null;
  if (typeof o.canCancel !== "boolean") return null;

  return {
    id: o.id,
    customerId: o.customerId,
    status: o.status as Order["status"],
    estimatedDelivery: o.estimatedDelivery,
    total: o.total,
    canCancel: o.canCancel,
    items: Array.isArray(o.items) ? (o.items as Order["items"]) : undefined,
    cancellationRequestedAt:
      typeof o.cancellationRequestedAt === "string" ? o.cancellationRequestedAt : undefined,
  };
}

function asOrderList(value: unknown): Order[] {
  if (!value || typeof value !== "object") return [];
  const payload = value as { orders?: unknown; error?: unknown };
  if (typeof payload.error === "string") return [];
  if (!Array.isArray(payload.orders)) return [];
  const out: Order[] = [];
  for (const item of payload.orders) {
    const order = asOrder(item);
    if (order) out.push(order);
  }
  return out;
}

function asCitations(value: unknown): ChatCitation[] {
  if (!value || typeof value !== "object") return [];
  const payload = value as { chunks?: unknown; empty?: unknown };
  if (payload.empty === true || !Array.isArray(payload.chunks)) return [];
  const out: ChatCitation[] = [];
  for (const chunk of payload.chunks) {
    if (!chunk || typeof chunk !== "object") continue;
    const c = chunk as { source?: unknown; title?: unknown };
    if (typeof c.source !== "string" || !c.source) continue;
    out.push({
      source: c.source,
      title: typeof c.title === "string" ? c.title : undefined,
    });
  }
  return out;
}
