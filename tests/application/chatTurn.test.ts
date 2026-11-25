import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";
import {
  extractTurnSideData,
  getCurrentTurnMessages,
} from "../../src/application/chatTurn.js";

const order12345 = {
  id: "12345",
  customerId: "customer-001",
  status: "delayed",
  estimatedDelivery: "2026-11-25",
  total: 299.9,
  canCancel: true,
};

const order12346 = {
  id: "12346",
  customerId: "customer-001",
  status: "delivered",
  estimatedDelivery: "2026-02-15",
  total: 199.8,
  canCancel: false,
};

describe("getCurrentTurnMessages", () => {
  it("devolve apenas mensagens após a última HumanMessage", () => {
    const turnAi = new AIMessage({
      content: "",
      tool_calls: [{ name: "get_order", args: { orderId: "12345" }, id: "c1", type: "tool_call" }],
    });
    const turnTool = new ToolMessage({
      content: JSON.stringify(order12345),
      tool_call_id: "c1",
      name: "get_order",
    });
    const turnReply = new AIMessage("Pedido 12345 atrasado.");

    const messages = [
      new HumanMessage("status 12345"),
      turnAi,
      turnTool,
      turnReply,
      new HumanMessage("política de devolução"),
      new AIMessage({
        content: "",
        tool_calls: [
          { name: "search_knowledge", args: { query: "devolução" }, id: "c2", type: "tool_call" },
        ],
      }),
      new ToolMessage({
        content: JSON.stringify({
          chunks: [{ source: "01-devolucao-eletronicos.md", title: "Dev", text: "7 dias" }],
          empty: false,
        }),
        tool_call_id: "c2",
        name: "search_knowledge",
      }),
      new AIMessage("7 dias.\n\nFonte: 01-devolucao-eletronicos.md"),
    ];

    const turn = getCurrentTurnMessages(messages);
    expect(turn).toHaveLength(3);
    expect(turn[0]).toBe(messages[5]);
    expect(turn.at(-1)?.content).toMatch(/7 dias/);
  });

  it("retorna [] se não houver HumanMessage", () => {
    expect(getCurrentTurnMessages([new AIMessage("oi")])).toEqual([]);
  });
});

describe("extractTurnSideData", () => {
  it("não reaproveita pedido de turnos anteriores", () => {
    const messages = [
      new HumanMessage("status 12345"),
      new AIMessage({
        content: "",
        tool_calls: [{ name: "get_order", args: { orderId: "12345" }, id: "c1", type: "tool_call" }],
      }),
      new ToolMessage({
        content: JSON.stringify(order12345),
        tool_call_id: "c1",
        name: "get_order",
      }),
      new AIMessage("ok"),
      new HumanMessage("Qual a política de devolução?"),
      new AIMessage({
        content: "",
        tool_calls: [
          { name: "search_knowledge", args: { query: "devolução" }, id: "c2", type: "tool_call" },
        ],
      }),
      new ToolMessage({
        content: JSON.stringify({
          chunks: [{ source: "01-devolucao-eletronicos.md", title: "Dev", text: "7 dias" }],
          empty: false,
        }),
        tool_call_id: "c2",
        name: "search_knowledge",
      }),
      new AIMessage("política"),
    ];

    const side = extractTurnSideData(messages);
    expect(side.orders).toEqual([]);
    expect(side.citations.map((c) => c.source)).toEqual(["01-devolucao-eletronicos.md"]);
    expect(side.toolCalls.map((t) => t.name)).toEqual(["search_knowledge"]);
  });

  it("agrega pedidos de list_orders sem duplicar ids", () => {
    const messages = [
      new HumanMessage("liste meus pedidos"),
      new AIMessage({
        content: "",
        tool_calls: [{ name: "list_orders", args: {}, id: "c1", type: "tool_call" }],
      }),
      new ToolMessage({
        content: JSON.stringify({ count: 2, orders: [order12345, order12346, order12345] }),
        tool_call_id: "c1",
        name: "list_orders",
      }),
      new AIMessage("2 pedidos"),
    ];

    const side = extractTurnSideData(messages);
    expect(side.orders.map((o) => o.id).sort()).toEqual(["12345", "12346"]);
    expect(side.toolCalls.map((t) => t.name)).toEqual(["list_orders"]);
  });
});
