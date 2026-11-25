import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { createServices } from "../../src/composition.js";
import type { Order } from "../../src/domain/types.js";

type ChatBody = {
  reply: string;
  threadId: string;
  orders: Order[];
  citations: Array<{ source: string; title?: string }>;
  toolCalls: Array<{ name: string; args?: Record<string, unknown> }>;
};

describe("POST /chat — side data escopada ao turno", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp(createServices({ llmMode: "mock" }));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  async function chat(sessionId: string, message: string, token = "tok_a") {
    const res = await app.inject({
      method: "POST",
      url: "/chat",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      payload: { sessionId, message },
    });
    return { status: res.statusCode, body: res.json() as ChatBody };
  }

  it("(a) após consultar 12345, pergunta de política devolve orders: []", async () => {
    const sessionId = "scope-a";
    const first = await chat(sessionId, "Qual o status do pedido 12345?");
    expect(first.status).toBe(200);
    expect(first.body.orders.map((o) => o.id)).toEqual(["12345"]);
    expect(first.body.toolCalls.map((t) => t.name)).toContain("get_order");

    const second = await chat(sessionId, "Qual é a política de devolução de eletrônicos?");
    expect(second.status).toBe(200);
    expect(second.body.orders).toEqual([]);
    expect(second.body.citations.some((c) => c.source.includes("devolucao"))).toBe(true);
    expect(second.body.toolCalls.map((t) => t.name)).toEqual(["search_knowledge"]);
    expect(second.body.toolCalls.map((t) => t.name)).not.toContain("get_order");
  });

  it("(b) liste meus pedidos devolve só pedidos do customer-001", async () => {
    const { status, body } = await chat("scope-b", "liste pra mim os pedidos");
    expect(status).toBe(200);
    expect(body.orders.map((o) => o.id).sort()).toEqual(["12345", "12346"]);
    expect(body.orders.every((o) => o.customerId === "customer-001")).toBe(true);
    expect(body.orders.map((o) => o.id)).not.toContain("99999");
    expect(body.toolCalls.map((t) => t.name)).toContain("list_orders");
  });

  it("(c) citations e toolCalls não acumulam entre turnos", async () => {
    const sessionId = "scope-c";
    const first = await chat(sessionId, "Qual o status do pedido 12345?");
    expect(first.body.toolCalls.map((t) => t.name)).toEqual(["get_order"]);
    expect(first.body.citations).toEqual([]);

    const second = await chat(sessionId, "Qual é a política de devolução de eletrônicos?");
    expect(second.body.toolCalls.map((t) => t.name)).toEqual(["search_knowledge"]);
    expect(second.body.citations.map((c) => c.source)).toEqual([
      "01-devolucao-eletronicos.md",
    ]);
    expect(second.body.orders).toEqual([]);

    const third = await chat(sessionId, "liste meus pedidos");
    expect(third.body.toolCalls.map((t) => t.name)).toEqual(["list_orders"]);
    expect(third.body.citations).toEqual([]);
    expect(third.body.orders.map((o) => o.id).sort()).toEqual(["12345", "12346"]);
  });
});
