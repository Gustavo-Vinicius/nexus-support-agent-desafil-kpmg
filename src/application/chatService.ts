import { Command, isInterrupted } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";
import { HumanMessage } from "@langchain/core/messages";
import type { AgentDeps } from "../agent/graph.js";
import { createSupportAgent } from "../agent/graph.js";
import { classifyChatFailure } from "./errors.js";

/** Evita que "s"/"n" isolados casem o início de "só"/"nunca" (ó/ã não são \w em JS). */
const CONFIRM_YES = /^(sim|yes|confirmo|confirmar)\b|^[sy]$/i;
const CONFIRM_NO = /^(n[aã]o|no|cancelar)\b|^n$/i;

export interface ChatInput {
  userId: string;
  sessionId: string;
  message: string;
}

export interface ChatResult {
  reply: string;
  threadId: string;
  awaitingConfirmation?: {
    orderId: string;
    prompt: string;
  };
}

export class ChatService {
  constructor(private readonly deps: AgentDeps) {}

  async handle(input: ChatInput): Promise<ChatResult> {
    const threadId = `${input.userId}:${input.sessionId}`;
    const config = { configurable: { thread_id: threadId } };
    const agent = createSupportAgent(this.deps, input.userId);

    try {
      const pending = await this.readPendingConfirmation(agent, config);
      if (pending) {
        const decision = parseConfirmation(input.message);
        if (decision === null) {
          return {
            reply: pending.message,
            threadId,
            awaitingConfirmation: {
              orderId: pending.orderId,
              prompt: pending.message,
            },
          };
        }

        const resumed = await agent.invoke(
          new Command({ resume: { confirmed: decision } }),
          config,
        );
        return toChatResult(threadId, resumed);
      }

      const state = await agent.invoke(
        { messages: [new HumanMessage(input.message)] },
        config,
      );
      return toChatResult(threadId, state);
    } catch (error) {
      throw classifyChatFailure(error);
    }
  }

  private async readPendingConfirmation(
    agent: ReturnType<typeof createSupportAgent>,
    config: { configurable: { thread_id: string } },
  ): Promise<{ orderId: string; message: string } | null> {
    try {
      const snapshot = await agent.getState(config);
      const value = snapshot.tasks
        .flatMap((task) => task.interrupts ?? [])
        .map((item) => item.value)
        .find(
          (v): v is { type: string; orderId: string; message: string } =>
            typeof v === "object" &&
            v !== null &&
            (v as { type?: string }).type === "cancellation_confirmation",
        );

      return value ? { orderId: value.orderId, message: value.message } : null;
    } catch {
      // Sem checkpoint ainda / erro de leitura — segue fluxo normal
      return null;
    }
  }
}

function parseConfirmation(message: string): boolean | null {
  const text = message.trim();
  if (CONFIRM_YES.test(text)) return true;
  if (CONFIRM_NO.test(text)) return false;
  return null;
}

function toChatResult(threadId: string, state: unknown): ChatResult {
  if (isInterrupted(state)) {
    const interruptValue = state.__interrupt__?.[0]?.value as
      | { orderId?: string; message?: string }
      | undefined;
    const prompt =
      interruptValue?.message ?? "Confirma o cancelamento? Responda sim ou não.";
    return {
      reply: prompt,
      threadId,
      awaitingConfirmation: {
        orderId: interruptValue?.orderId ?? "unknown",
        prompt,
      },
    };
  }

  const messages = (state as { messages?: BaseMessage[] }).messages ?? [];
  const last = messages.at(-1);
  const content =
    typeof last?.content === "string" ? last.content : JSON.stringify(last?.content);

  return { reply: content || "Sem resposta do agente.", threadId };
}
