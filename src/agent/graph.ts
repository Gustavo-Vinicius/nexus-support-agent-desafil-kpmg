import { createReactAgent } from "@langchain/langgraph/prebuilt";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import type { LanguageModelLike } from "@langchain/core/language_models/base";
import type { CancellationService } from "../domain/cancellationService.js";
import type { KnowledgeService } from "../domain/knowledgeService.js";
import type { OrderService } from "../domain/orderService.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { createGetOrderTool } from "./tools/getOrder.js";
import { createListOrdersTool } from "./tools/listOrders.js";
import { createRequestCancellationTool } from "./tools/requestCancellation.js";
import { createSearchKnowledgeTool } from "./tools/searchKnowledge.js";

export interface AgentDeps {
  llm: LanguageModelLike;
  checkpointer: BaseCheckpointSaver;
  orderService: OrderService;
  cancellationService: CancellationService;
  knowledgeService: KnowledgeService;
}

export function createSupportAgent(deps: AgentDeps, userId: string) {
  const tools = [
    createGetOrderTool(deps.orderService, userId),
    createListOrdersTool(deps.orderService, userId),
    createSearchKnowledgeTool(deps.knowledgeService),
    createRequestCancellationTool(deps.cancellationService, userId),
  ];

  return createReactAgent({
    llm: deps.llm,
    tools,
    checkpointer: deps.checkpointer,
    prompt: SYSTEM_PROMPT,
  });
}
