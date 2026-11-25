import { describe, expect, it } from "vitest";
import {
  ChatApplicationError,
  OrdersApiUnavailableError,
  classifyChatFailure,
} from "../../src/application/errors.js";

describe("classifyChatFailure", () => {
  it("mapeia rate limit / créditos para 503 llm_rate_limited", () => {
    const err = classifyChatFailure(
      new Error("429 You have no credits remaining. credit_balance_exhausted"),
    );
    expect(err).toBeInstanceOf(ChatApplicationError);
    expect(err.code).toBe("llm_rate_limited");
    expect(err.httpStatus).toBe(503);
  });

  it("mapeia falha de rede/API key para 503 llm_unavailable", () => {
    const err = classifyChatFailure(new Error("fetch failed ECONNREFUSED"));
    expect(err.code).toBe("llm_unavailable");
    expect(err.httpStatus).toBe(503);
    expect(err.exposeMessage.toLowerCase()).toMatch(/modelo|linguagem/);
  });

  it("mapeia API de pedidos indisponível", () => {
    const err = classifyChatFailure(new OrdersApiUnavailableError());
    expect(err.code).toBe("orders_api_unavailable");
    expect(err.httpStatus).toBe(503);
  });
});
