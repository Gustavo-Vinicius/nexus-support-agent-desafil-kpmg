import { ChatOpenAI } from "@langchain/openai";
import { MockSupportChatModel } from "./mockChatModel.js";

export type LlmMode = "real" | "mock";

export function createLlmProvider(mode: LlmMode = "mock") {
  if (mode === "real") {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("LLM_MODE=real exige OPENAI_API_KEY no .env");
    }
    return new ChatOpenAI({
      model: "gpt-4o-mini",
      temperature: 0,
    });
  }

  return new MockSupportChatModel();
}
