import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { createServices } from "../../src/composition.js";

/**
 * Cenários mínimos do enunciado (Desafio A §1), com LLM mock.
 * Auth: tok_a → customer-001 (dono do pedido 12345).
 */
describe("Cenários mínimos de chat", () => {
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
    return { status: res.statusCode, body: res.json() as { reply: string; threadId: string } };
  }

  it("1) política de devolução de eletrônicos — cita fonte", async () => {
    const { status, body } = await chat("sc-1", "Qual é a política de devolução de eletrônicos?");
    expect(status).toBe(200);
    expect(body.reply.toLowerCase()).toMatch(/devolu|eletr[oô]nic|7 dias/);
    expect(body.reply).toMatch(/01-devolucao-eletronicos\.md|Fonte:/i);
  });

  it("2) status do pedido 12345", async () => {
    const { status, body } = await chat("sc-2", "Qual o status do pedido 12345?");
    expect(status).toBe(200);
    expect(body.reply).toMatch(/12345/);
    expect(body.reply.toLowerCase()).toMatch(/delayed|atrasad/);
  });

  it("3) pedido atrasado — o que posso fazer", async () => {
    const { status, body } = await chat(
      "sc-3",
      "Meu pedido está atrasado. O que posso fazer?",
    );
    expect(status).toBe(200);
    expect(body.reply.toLowerCase()).toMatch(/atrasad|cancel|previs|estimated|reclam/i);
    expect(body.reply).toMatch(/03-prazo-entrega\.txt|Fonte:/i);
  });

  it("4) cancelamento do 12345 — pede confirmação (não executa ainda)", async () => {
    const { status, body } = await chat("sc-4", "Quero cancelar o pedido 12345.");
    expect(status).toBe(200);
    expect(body.reply.toLowerCase()).toMatch(/confirm/);
    expect(body.threadId).toBe("customer-001:sc-4");
  });

  it("5) continuidade — previsão de entrega dele", async () => {
    const sessionId = "sc-5";
    const first = await chat(sessionId, "Qual o status do pedido 12345?");
    expect(first.status).toBe(200);
    expect(first.body.reply).toMatch(/12345/);

    const followUp = await chat(sessionId, "E qual a previsão de entrega dele?");
    expect(followUp.status).toBe(200);
    expect(followUp.body.reply).toMatch(/2026-11-25|previs/i);
  });

  it("pedido de terceiro — sem vazar dados", async () => {
    const { status, body } = await chat("sc-other", "Qual o status do pedido 99999?");
    expect(status).toBe(200);
    expect(body.reply.toLowerCase()).not.toMatch(/customer-002/);
    expect(body.reply.toLowerCase()).toMatch(/n[aã]o|permiss|encontr|forbidden|not_found|sem permiss/);
  });
});
