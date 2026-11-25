import { ChatService } from "./application/chatService.js";
import { CancellationService } from "./domain/cancellationService.js";
import { KnowledgeService } from "./domain/knowledgeService.js";
import { OrderService } from "./domain/orderService.js";
import { createCheckpointer } from "./infra/checkpointer.js";
import { createBm25PolicyIndex } from "./infra/knowledge/policyIndex.js";
import { createLlmProvider, type LlmMode } from "./infra/llm/provider.js";
import {
  createInMemoryOrdersRepository,
  type OrdersRepository,
} from "./infra/orders/ordersRepository.js";

export interface AppServices {
  orderService: OrderService;
  cancellationService: CancellationService;
  knowledgeService: KnowledgeService;
  chatService: ChatService;
  orders: OrdersRepository;
}

export interface CreateServicesOptions {
  llmMode?: LlmMode;
  orders?: OrdersRepository;
  knowledgeThreshold?: number;
}

export function createServices(options?: CreateServicesOptions): AppServices {
  const orders = options?.orders ?? createInMemoryOrdersRepository();
  const orderService = new OrderService(orders);
  const cancellationService = new CancellationService(orders);
  const knowledgeService = new KnowledgeService(
    createBm25PolicyIndex(),
    options?.knowledgeThreshold,
  );

  const llmMode = options?.llmMode ?? ((process.env.LLM_MODE as LlmMode | undefined) || "mock");
  const chatService = new ChatService({
    llm: createLlmProvider(llmMode),
    checkpointer: createCheckpointer(),
    orderService,
    cancellationService,
    knowledgeService,
  });

  return { orderService, cancellationService, knowledgeService, chatService, orders };
}
