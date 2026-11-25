import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { KnowledgeService } from "../../src/domain/knowledgeService.js";
import {
  createBm25PolicyIndex,
  loadPolicyDocuments,
} from "../../src/infra/knowledge/policyIndex.js";

describe("KnowledgeService + políticas em arquivo", () => {
  const index = createBm25PolicyIndex();
  const service = new KnowledgeService(index, 0.15);

  it("carrega as 3 políticas a partir de TXT/Markdown", () => {
    const docs = loadPolicyDocuments(resolve(process.cwd(), "data/policies"));
    const sources = new Set(docs.map((d) => d.source));
    expect(sources.has("01-devolucao-eletronicos.md")).toBe(true);
    expect(sources.has("02-cancelamento.md")).toBe(true);
    expect(sources.has("03-prazo-entrega.txt")).toBe(true);
  });

  it("responde devolução de eletrônicos com fonte do arquivo", () => {
    const chunks = service.search("política de devolução de eletrônicos");
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.source).toBe("01-devolucao-eletronicos.md");
  });

  it("responde sobre cancelamento com fonte do arquivo", () => {
    const chunks = service.search("confirmação obrigatória para cancelar pedido");
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.source).toBe("02-cancelamento.md");
  });

  it("responde sobre pedido atrasado / prazo de entrega", () => {
    const chunks = service.search("pedido atrasado o que posso fazer previsão de entrega");
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.source).toBe("03-prazo-entrega.txt");
  });

  it("filtra por limiar quando não há relevância", () => {
    const strict = new KnowledgeService(index, 0.99);
    expect(strict.search("xyzzy foobar unrelated")).toEqual([]);
  });
});
