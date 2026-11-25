import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { createServices } from "../../src/composition.js";

describe("DELETE /sessions/:sessionId", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp(createServices({ llmMode: "mock" }));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  async function chat(sessionId: string, message: string, token: string) {
    return app.inject({
      method: "POST",
      url: "/chat",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      payload: { sessionId, message },
    });
  }

  async function deleteSession(sessionId: string, token: string) {
    return app.inject({
      method: "DELETE",
      url: `/sessions/${sessionId}`,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  it("apagar a própria sessão faz o próximo /chat começar sem contexto", async () => {
    const sessionId = randomUUID();

    const first = await chat(sessionId, "Qual o status do pedido 12345?", "tok_a");
    expect(first.statusCode).toBe(200);
    expect(first.json().reply).toMatch(/12345/);

    const withContext = await chat(
      sessionId,
      "E qual a previsão de entrega dele?",
      "tok_a",
    );
    expect(withContext.statusCode).toBe(200);
    expect(withContext.json().reply).toMatch(/2026-11-25/);

    const deleted = await deleteSession(sessionId, "tok_a");
    expect(deleted.statusCode).toBe(204);
    expect(deleted.body).toBe("");

    const again = await deleteSession(sessionId, "tok_a");
    expect(again.statusCode).toBe(204);

    const withoutContext = await chat(
      sessionId,
      "E qual a previsão de entrega dele?",
      "tok_a",
    );
    expect(withoutContext.statusCode).toBe(200);
    expect(withoutContext.json().reply).not.toMatch(/2026-11-25/);
    expect(withoutContext.json().orders ?? []).toEqual([]);
  });

  it("customer-002 com sessionId do customer-001 não afeta a conversa do dono", async () => {
    const sessionId = randomUUID();

    const seeded = await chat(sessionId, "Qual o status do pedido 12345?", "tok_a");
    expect(seeded.statusCode).toBe(200);
    expect(seeded.json().reply).toMatch(/12345/);

    const foreignDelete = await deleteSession(sessionId, "tok_b");
    expect(foreignDelete.statusCode).toBe(204);

    const stillHasContext = await chat(
      sessionId,
      "E qual a previsão de entrega dele?",
      "tok_a",
    );
    expect(stillHasContext.statusCode).toBe(200);
    expect(stillHasContext.json().reply).toMatch(/2026-11-25/);
  });

  it("sessionId inválido (não uuid) retorna 400", async () => {
    const res = await deleteSession("nao-e-uuid", "tok_a");
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_params");
  });

  it("sem Bearer retorna 401", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/sessions/${randomUUID()}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it("apaga também cancelamento pendente da sessão", async () => {
    const sessionId = randomUUID();

    const pending = await chat(sessionId, "Quero cancelar o pedido 12345.", "tok_a");
    expect(pending.statusCode).toBe(200);
    expect(pending.json().awaitingConfirmation).toBeTruthy();

    expect((await deleteSession(sessionId, "tok_a")).statusCode).toBe(204);

    const next = await chat(sessionId, "talvez depois", "tok_a");
    expect(next.statusCode).toBe(200);
    expect(next.json().awaitingConfirmation).toBeUndefined();
    expect(next.json().reply.toLowerCase()).not.toMatch(/confirma o cancelamento/);
  });
});
