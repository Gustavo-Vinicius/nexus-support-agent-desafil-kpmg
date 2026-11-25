import { MemorySaver } from "@langchain/langgraph";

/** Checkpointer in-memory: estado por thread (userId:sessionId). */
export function createCheckpointer() {
  return new MemorySaver();
}
