import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { ChatService } from "../../src/application/chatService.js";
import { ChatApplicationError } from "../../src/application/errors.js";
import { buildApp } from "../../src/app.js";
import { createServices } from "../../src/composition.js";

describe("POST /chat — erros estruturados", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const services = createServices({ llmMode: "mock" });
    // Substitui o chatService por um stub que simula LLM fora do ar
    const failingChat: Pick<ChatService, "handle"> = {
      async handle() {
        throw new ChatApplicationError(
          "llm_unavailable",
          "Não foi possível contatar o modelo de linguagem. Nenhum dado foi inventado.",
          503,
        );
      },
    };
    services.chatService = failingChat as ChatService;
    app = await buildApp(services);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("retorna 503 estruturado quando o LLM está indisponível (sem inventar resposta)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/chat",
      headers: {
        authorization: "Bearer tok_a",
        "content-type": "application/json",
      },
      payload: { sessionId: "err-1", message: "Qual o status do pedido 12345?" },
    });

    expect(res.statusCode).toBe(503);
    const body = res.json() as { error: string; message: string; reply?: string };
    expect(body.error).toBe("llm_unavailable");
    expect(body.message.toLowerCase()).toMatch(/modelo|linguagem|inventado/);
    expect(body.reply).toBeUndefined();
  });

  it("ainda valida body inválido com 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/chat",
      headers: {
        authorization: "Bearer tok_a",
        "content-type": "application/json",
      },
      payload: { sessionId: "err-2" },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe("invalid_body");
  });
});
