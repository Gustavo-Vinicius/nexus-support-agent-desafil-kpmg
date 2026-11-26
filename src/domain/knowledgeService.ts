import type { PolicyIndex } from "../infra/knowledge/policyIndex.js";
import type { KnowledgeChunk } from "./types.js";

/** Limiar baixo: docs inteiros diluem BM25; 0.15 ainda filtra ruido quase-zero. */
const DEFAULT_THRESHOLD = 0.15;

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
