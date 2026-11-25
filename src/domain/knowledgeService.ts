import type { PolicyIndex } from "../infra/knowledge/policyIndex.js";
import type { KnowledgeChunk } from "./types.js";

const DEFAULT_THRESHOLD = 0.35;

export class KnowledgeService {
  constructor(
    private readonly index: PolicyIndex,
    private readonly relevanceThreshold = DEFAULT_THRESHOLD,
  ) {}

  /** Busca com limiar: abaixo do score, não devolve chunk (evita resposta inventada). */
  search(query: string, limit = 3): KnowledgeChunk[] {
    return this.index
      .search(query, limit)
      .filter((chunk) => chunk.score >= this.relevanceThreshold);
  }
}
