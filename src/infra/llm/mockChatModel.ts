import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import {
  BaseChatModel,
  type BaseChatModelParams,
} from "@langchain/core/language_models/chat_models";
import type { ChatResult } from "@langchain/core/outputs";

/** Ids do enunciado (12345) — evita capturar anos (2026) de estimatedDelivery. */
const ORDER_ID = /\b(?:ORD-)?(\d{5,})\b/i;

/**
 * LLM fake com tool-calling heurístico para demo/testes sem créditos OpenAI.
 * Cobre os cenários mínimos do enunciado, inclusive follow-up de contexto.
 */
export class MockSupportChatModel extends BaseChatModel {
  constructor(fields: BaseChatModelParams = {}) {
    super({ ...fields, disableStreaming: true });
  }

  _llmType(): string {
    return "mock-support";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bindTools(tools: any[]) {
    const toolDicts = tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description ?? "",
        parameters: { type: "object", properties: {} },
      },
    }));
    return this.withConfig({ tools: toolDicts } as Record<string, unknown>);
  }

  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    const message = this.decide(messages);
    return {
      generations: [
        {
          message,
          text: typeof message.content === "string" ? message.content : "",
        },
      ],
    };
  }

  private decide(messages: BaseMessage[]): AIMessage {
    const last = messages.at(-1);
    // Já produzimos uma resposta final neste turno
    if (
      last &&
      last._getType() === "ai" &&
      (!(last as AIMessage).tool_calls || (last as AIMessage).tool_calls?.length === 0) &&
      String(last.content ?? "").length > 0
    ) {
      return new AIMessage(String(last.content));
    }

    const lastHumanIdx = findLastIndex(messages, (m) => m._getType() === "human");
    const afterHuman = messages.slice(lastHumanIdx + 1);
    const toolsThisTurn = afterHuman.filter((m) => isToolMessage(m));

    if (toolsThisTurn.length > 0) {
      return summarizeTools(toolsThisTurn);
    }

    const human = lastHumanIdx >= 0 ? messages[lastHumanIdx] : undefined;
    const text =
      typeof human?.content === "string"
        ? human.content
        : JSON.stringify(human?.content ?? "");
    const lower = text.toLowerCase();

    const orderId = extractOrderId(text) ?? extractOrderIdFromHistory(messages, lastHumanIdx);

    if (orderId && /cancel/.test(lower)) {
      return toolCall("request_cancellation", { orderId });
    }

    if (/(quantos pedidos|meus pedidos|listar pedidos|liste|quais pedidos)/i.test(lower)) {
      return toolCall("list_orders", {});
    }

    // Políticas antes do fallback de orderId no histórico (evita get_order em pergunta de devolução)
    if (/(pol[ií]tica|devolu[cç][aã]o|eletr[oô]nic|cancelamento|prazo)/i.test(lower)) {
      return toolCall("search_knowledge", { query: text });
    }

    if (/(atrasad|o que posso fazer|previs[aã]o de entrega)/i.test(lower)) {
      return toolCall("search_knowledge", { query: text });
    }

    // Continuidade: "previsão de entrega dele" / "status dele"
    if (
      orderId &&
      /(previs[aã]o|entrega|status|atrasad|dele|desse pedido|do pedido)/i.test(lower)
    ) {
      return toolCall("get_order", { orderId });
    }

    if (orderId) {
      return toolCall("get_order", { orderId });
    }

    return new AIMessage(
      "Sou o Nexus Support Agent (modo mock). Posso consultar pedidos (ex.: 12345), políticas de devolução/cancelamento/prazo ou solicitar cancelamento.",
    );
  }
}

function isToolMessage(m: BaseMessage): boolean {
  return m._getType() === "tool" || m.constructor.name === "ToolMessage";
}

function summarizeTools(toolMessages: BaseMessage[]): AIMessage {
  const contents = toolMessages.map((m) =>
    typeof m.content === "string" ? m.content : JSON.stringify(m.content),
  );

  for (const raw of contents) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      if (parsed.error === "not_found_or_forbidden") {
        return new AIMessage(
          `Não encontrei o pedido ${String(parsed.orderId)} para este cliente ou não há permissão de acesso.`,
        );
      }

      if (
        parsed.error === "orders_api_unavailable" ||
        parsed.error === "tool_failed"
      ) {
        return new AIMessage(
          `Não consegui concluir a operação (${String(parsed.error)}). ` +
            `${String(parsed.message ?? "Serviço indisponível")}. Nenhum dado foi inventado.`,
        );
      }

      if (typeof parsed.count === "number" && Array.isArray(parsed.orders)) {
        const orders = parsed.orders as Array<{ id?: string; status?: string }>;
        if (orders.length === 0) {
          return new AIMessage("Você não possui pedidos registrados nesta conta.");
        }
        const lines = orders
          .map((o) => `- ${o.id ?? "?"}: status "${o.status ?? "?"}"`)
          .join("\n");
        return new AIMessage(`Você tem ${parsed.count} pedido(s):\n${lines}`);
      }

      if (typeof parsed.id === "string" && typeof parsed.status === "string") {
        const delivery =
          typeof parsed.estimatedDelivery === "string"
            ? parsed.estimatedDelivery
            : "não informada";
        const delayedNote =
          parsed.status === "delayed"
            ? " O pedido está atrasado em relação à previsão original."
            : "";
        return new AIMessage(
          `Pedido ${parsed.id}: status "${parsed.status}". Previsão de entrega: ${delivery}. ` +
            `canCancel=${String(parsed.canCancel)}.${delayedNote}`,
        );
      }

      if (Array.isArray(parsed.chunks)) {
        const chunks = parsed.chunks as Array<{ source?: string; text?: string; title?: string }>;
        if (chunks.length === 0 || parsed.empty === true) {
          return new AIMessage(
            "Não encontrei trechos pertinentes nas políticas oficiais para essa pergunta.",
          );
        }
        const top = chunks[0]!;
        return new AIMessage(
          `${top.text ?? ""}\n\nFonte: ${top.source ?? "política interna"}` +
            (top.title ? ` (${top.title})` : ""),
        );
      }
    } catch {
      // fallback textual
    }
  }

  return new AIMessage(`Aqui está o que encontrei com base nas tools:\n${contents.join("\n")}`);
}

function extractOrderId(text: string): string | undefined {
  return text.match(ORDER_ID)?.[1];
}

function extractOrderIdFromHistory(messages: BaseMessage[], beforeIdx: number): string | undefined {
  for (let i = beforeIdx - 1; i >= 0; i -= 1) {
    const m = messages[i]!;
    // Preferir id em mensagens humanas ou JSON de pedido ("id":"12345")
    const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    const fromJson = content.match(/"id"\s*:\s*"(\d{5,})"/);
    if (fromJson?.[1]) return fromJson[1];
    const fromText = extractOrderId(content);
    if (fromText) return fromText;
  }
  return undefined;
}

let toolCallSeq = 0;

function toolCall(name: string, args: Record<string, string>): AIMessage {
  toolCallSeq += 1;
  return new AIMessage({
    content: "",
    tool_calls: [
      {
        name,
        args,
        id: `mock-${name}-${toolCallSeq}-${Date.now()}`,
        type: "tool_call",
      },
    ],
  });
}

function findLastIndex<T>(items: T[], pred: (item: T) => boolean): number {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (pred(items[i] as T)) return i;
  }
  return -1;
}
