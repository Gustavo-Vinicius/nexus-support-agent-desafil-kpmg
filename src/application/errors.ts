export type ChatErrorCode =
  | "llm_unavailable"
  | "llm_rate_limited"
  | "tool_failed"
  | "orders_api_unavailable"
  | "invalid_arguments"
  | "chat_failed";

export class ChatApplicationError extends Error {
  readonly code: ChatErrorCode;
  readonly httpStatus: number;
  readonly exposeMessage: string;

  constructor(
    code: ChatErrorCode,
    exposeMessage: string,
    httpStatus: number,
    cause?: unknown,
  ) {
    super(exposeMessage, cause !== undefined ? { cause } : undefined);
    this.name = "ChatApplicationError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.exposeMessage = exposeMessage;
  }
}

export class OrdersApiUnavailableError extends Error {
  constructor(message = "API de pedidos indisponível") {
    super(message);
    this.name = "OrdersApiUnavailableError";
  }
}

/** Classifica erros do LangGraph/OpenAI/tools em erros de aplicação estáveis. */
export function classifyChatFailure(error: unknown): ChatApplicationError {
  if (error instanceof ChatApplicationError) return error;

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  const name = error instanceof Error ? error.name : "";

  if (
    lower.includes("credit_balance_exhausted") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("429")
  ) {
    return new ChatApplicationError(
      "llm_rate_limited",
      "O modelo de linguagem está temporariamente indisponível (limite/créditos). Tente novamente mais tarde.",
      503,
      error,
    );
  }

  if (
    lower.includes("incorrect api key") ||
    lower.includes("invalid_api_key") ||
    lower.includes("authentication") ||
    lower.includes("401") ||
    lower.includes("enotfound") ||
    lower.includes("econnrefused") ||
    lower.includes("fetch failed") ||
    lower.includes("network") ||
    lower.includes("timeout") ||
    lower.includes("model_rate_limit") ||
    name === "APIConnectionError"
  ) {
    return new ChatApplicationError(
      "llm_unavailable",
      "Não foi possível contatar o modelo de linguagem. Nenhum dado foi inventado.",
      503,
      error,
    );
  }

  if (
    lower.includes("orders_api_unavailable") ||
    name === "OrdersApiUnavailableError" ||
    error instanceof OrdersApiUnavailableError
  ) {
    return new ChatApplicationError(
      "orders_api_unavailable",
      "A API de pedidos está indisponível no momento. Não foi possível consultar ou alterar pedidos.",
      503,
      error,
    );
  }

  if (
    lower.includes("tool") &&
    (lower.includes("failed") || lower.includes("error") || lower.includes("invalid"))
  ) {
    return new ChatApplicationError(
      "tool_failed",
      "Falha ao executar uma ferramenta do agente. Nenhum resultado foi inventado.",
      502,
      error,
    );
  }

  if (lower.includes("invalid") && lower.includes("argument")) {
    return new ChatApplicationError(
      "invalid_arguments",
      "Argumentos inválidos para a ferramenta solicitada.",
      400,
      error,
    );
  }

  return new ChatApplicationError(
    "chat_failed",
    "Não foi possível concluir a conversa. Tente novamente.",
    500,
    error,
  );
}
