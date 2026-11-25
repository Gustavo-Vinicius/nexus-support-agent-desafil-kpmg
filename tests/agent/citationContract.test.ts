import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT } from "../../src/agent/prompt.js";
import { createSearchKnowledgeTool } from "../../src/agent/tools/searchKnowledge.js";
import { KnowledgeService } from "../../src/domain/knowledgeService.js";
import { createBm25PolicyIndex } from "../../src/infra/knowledge/policyIndex.js";

describe("Contrato de citação de fonte", () => {
  it("prompt exige citar source no formato Fonte:", () => {
    expect(SYSTEM_PROMPT).toMatch(/Fonte:\s*<source>/);
    expect(SYSTEM_PROMPT).toMatch(/search_knowledge/);
    expect(SYSTEM_PROMPT).toMatch(/citation|cite|citação/i);
  });

  it("tool devolve citationRequired e howToCite com o source do arquivo", async () => {
    const tool = createSearchKnowledgeTool(
      new KnowledgeService(createBm25PolicyIndex(), 0.15),
    );
    const raw = await tool.invoke({ query: "devolução de eletrônicos" });
    const payload = JSON.parse(String(raw)) as {
      empty: boolean;
      citationRequired: boolean;
      howToCite: string;
      chunks: Array<{ source: string }>;
    };

    expect(payload.empty).toBe(false);
    expect(payload.citationRequired).toBe(true);
    expect(payload.chunks[0]?.source).toBe("01-devolucao-eletronicos.md");
    expect(payload.howToCite).toContain("Fonte:");
    expect(payload.howToCite).toContain("01-devolucao-eletronicos.md");
  });

  it("tool vazia orienta declarar ausência, sem inventar", async () => {
    const tool = createSearchKnowledgeTool(
      new KnowledgeService(createBm25PolicyIndex(), 0.99),
    );
    const raw = await tool.invoke({ query: "xyzzy foobar unrelated" });
    const payload = JSON.parse(String(raw)) as {
      empty: boolean;
      howToCite: string;
    };

    expect(payload.empty).toBe(true);
    expect(payload.howToCite.toLowerCase()).toMatch(/ausência|não invente/);
  });
});
