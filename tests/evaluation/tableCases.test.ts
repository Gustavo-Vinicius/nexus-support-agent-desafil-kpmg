import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { OrdersApiUnavailableError } from "../../src/application/errors.js";
import { buildApp } from "../../src/app.js";
import { createServices } from "../../src/composition.js";
import { createGetOrderTool } from "../../src/agent/tools/getOrder.js";
import { createSearchKnowledgeTool } from "../../src/agent/tools/searchKnowledge.js";
import { KnowledgeService } from "../../src/domain/knowledgeService.js";
import { createBm25PolicyIndex } from "../../src/infra/knowledge/policyIndex.js";
import type { OrdersRepository } from "../../src/infra/orders/ordersRepository.js";
import type { Order } from "../../src/domain/types.js";

/**
 * Casos da tabela de avaliação do enunciado (Desafio A).
 * LLM mock + services reais / repositório falho quando necessário.
 */
describe("Tabela de avaliação (enunciado)", () => {
  describe("Pedido existente do usuário — consulta e informa status correto", () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = await buildApp(createServices({ llmMode: "mock" }));
      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    it("GET /orders/12345 com tok_a devolve status delayed", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/orders/12345",
        headers: { authorization: "Bearer tok_a" },
      });
      expect(res.statusCode).toBe(200);
      const order = res.json() as Order;
      expect(order.id).toBe("12345");
      expect(order.customerId).toBe("customer-001");
      expect(order.status).toBe("delayed");
      expect(order.estimatedDelivery).toBe("2026-11-25");
    });

    it("POST /chat informa status correto do pedido 12345", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/chat",
        headers: {
          authorization: "Bearer tok_a",
          "content-type": "application/json",
        },
        payload: { sessionId: "eval-ok", message: "Qual o status do pedido 12345?" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { reply: string };
      expect(body.reply).toMatch(/12345/);
      expect(body.reply.toLowerCase()).toMatch(/delayed|atrasad/);
      expect(body.reply).toMatch(/2026-11-25/);
    });
  });

  describe("Pedido de outro cliente — acesso negado sem expor dados", () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = await buildApp(createServices({ llmMode: "mock" }));
      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    it("GET /orders/99999 com tok_a → 404 sem customer-002", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/orders/99999",
        headers: { authorization: "Bearer tok_a" },
      });
      expect(res.statusCode).toBe(404);
      const body = res.json() as Record<string, unknown>;
      expect(JSON.stringify(body).toLowerCase()).not.toContain("customer-002");
      expect(JSON.stringify(body).toLowerCase()).not.toContain("teclado");
      expect(body.error).toBe("not_found");
    });

    it("POST /chat sobre 99999 não vaza dados do dono", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/chat",
        headers: {
          authorization: "Bearer tok_a",
          "content-type": "application/json",
        },
        payload: { sessionId: "eval-third", message: "Qual o status do pedido 99999?" },
      });
      expect(res.statusCode).toBe(200);
      const reply = (res.json() as { reply: string }).reply.toLowerCase();
      expect(reply).not.toContain("customer-002");
      expect(reply).not.toContain("459");
      expect(reply).toMatch(/n[aã]o|permiss|encontr|forbidden|sem permiss/);
    });
  });

  describe("Política não localizada — reconhece limite de informação", () => {
    it("search_knowledge com limiar alto → empty + orientação de ausência", async () => {
      const tool = createSearchKnowledgeTool(
        new KnowledgeService(createBm25PolicyIndex(), 0.99),
      );
      const raw = await tool.invoke({ query: "xyzzy foobar política inexistente 999" });
      const payload = JSON.parse(String(raw)) as {
        empty: boolean;
        chunks: unknown[];
        howToCite: string;
      };
      expect(payload.empty).toBe(true);
      expect(payload.chunks).toEqual([]);
      expect(payload.howToCite.toLowerCase()).toMatch(/ausência|não invente/);
    });

    it("POST /chat declara ausência quando não há trecho pertinente", async () => {
      // Limiar alto força empty na knowledge; mock resume como "não encontrei"
      const app = await buildApp(
        createServices({ llmMode: "mock", knowledgeThreshold: 0.99 }),
      );
      await app.ready();

      const res = await app.inject({
        method: "POST",
        url: "/chat",
        headers: {
          authorization: "Bearer tok_a",
          "content-type": "application/json",
        },
        payload: {
          sessionId: "eval-no-policy",
          message: "Qual a política de garantia estendida interestelar?",
        },
      });

      expect(res.statusCode).toBe(200);
      const reply = (res.json() as { reply: string }).reply.toLowerCase();
      expect(reply).toMatch(/n[aã]o (encontrei|h[aá])|ausência|pertinen|oficiais|informação/);
      expect(reply).not.toMatch(/30 dias de garantia interestelar/);

      await app.close();
    });
  });

  describe("Cancelamento sem confirmação — não executa operação", () => {
    it("após pedir cancelamento sem 'sim', pedido continua cancelável", async () => {
      const services = createServices({ llmMode: "mock" });
      const app = await buildApp(services);
      await app.ready();

      const before = services.orders.findById("12345");
      expect(before?.status).toBe("delayed");
      expect(before?.canCancel).toBe(true);

      const ask = await app.inject({
        method: "POST",
        url: "/chat",
        headers: {
          authorization: "Bearer tok_a",
          "content-type": "application/json",
        },
        payload: { sessionId: "eval-cancel", message: "Quero cancelar o pedido 12345." },
      });
      expect(ask.statusCode).toBe(200);
      const askBody = ask.json() as {
        reply: string;
        awaitingConfirmation?: { orderId: string };
      };
      expect(askBody.reply.toLowerCase()).toMatch(/confirm/);
      expect(askBody.awaitingConfirmation?.orderId).toBe("12345");

      // Mensagem que NÃO confirma
      const skip = await app.inject({
        method: "POST",
        url: "/chat",
        headers: {
          authorization: "Bearer tok_a",
          "content-type": "application/json",
        },
        payload: {
          sessionId: "eval-cancel",
          message: "só estou pensando, me diga mais detalhes",
        },
      });
      expect(skip.statusCode).toBe(200);

      const after = services.orders.findById("12345");
      expect(after?.status).toBe("delayed");
      expect(after?.canCancel).toBe(true);
      expect(after?.cancellationRequestedAt).toBeUndefined();

      await app.close();
    });
  });

  describe("API indisponível — erro tratado; sem resultado inventado", () => {
    it("get_order devolve orders_api_unavailable sem inventar status", async () => {
      const failingOrders: OrdersRepository = {
        findById() {
          throw new OrdersApiUnavailableError();
        },
        save() {
          throw new OrdersApiUnavailableError();
        },
        listByCustomer() {
          throw new OrdersApiUnavailableError();
        },
      };
      const { orderService } = createServices({ orders: failingOrders });
      const tool = createGetOrderTool(orderService, "customer-001");
      const raw = await tool.invoke({ orderId: "12345" });
      const payload = JSON.parse(String(raw)) as {
        error: string;
        status?: string;
        message?: string;
      };

      expect(payload.error).toBe("orders_api_unavailable");
      expect(payload.status).toBeUndefined();
      expect(payload.message?.toLowerCase()).toMatch(/indispon|não invente/);
    });

    it("POST /chat com API de pedidos fora do ar não inventa status", async () => {
      const failingOrders: OrdersRepository = {
        findById() {
          throw new OrdersApiUnavailableError();
        },
        save() {
          throw new OrdersApiUnavailableError();
        },
        listByCustomer() {
          throw new OrdersApiUnavailableError();
        },
      };
      const app = await buildApp(
        createServices({ llmMode: "mock", orders: failingOrders }),
      );
      await app.ready();

      const res = await app.inject({
        method: "POST",
        url: "/chat",
        headers: {
          authorization: "Bearer tok_a",
          "content-type": "application/json",
        },
        payload: { sessionId: "eval-api-down", message: "Qual o status do pedido 12345?" },
      });

      expect(res.statusCode).toBe(200);
      const reply = (res.json() as { reply: string }).reply.toLowerCase();
      expect(reply).toMatch(/indispon|não consegui|falha|orders_api_unavailable|inventado/);
      expect(reply).not.toMatch(/status "delayed"/);
      expect(reply).not.toMatch(/r\$\s*299/);

      await app.close();
    });

    it("POST /chat com LLM indisponível → 503 sem reply inventado", async () => {
      const services = createServices({ llmMode: "mock" });
      services.chatService = {
        handle: async () => {
          throw new (await import("../../src/application/errors.js")).ChatApplicationError(
            "llm_unavailable",
            "Não foi possível contatar o modelo de linguagem. Nenhum dado foi inventado.",
            503,
          );
        },
      } as never;

      const app = await buildApp(services);
      await app.ready();

      const res = await app.inject({
        method: "POST",
        url: "/chat",
        headers: {
          authorization: "Bearer tok_a",
          "content-type": "application/json",
        },
        payload: { sessionId: "eval-llm-down", message: "oi" },
      });

      expect(res.statusCode).toBe(503);
      const body = res.json() as { error: string; reply?: string };
      expect(body.error).toBe("llm_unavailable");
      expect(body.reply).toBeUndefined();

      await app.close();
    });
  });
});
