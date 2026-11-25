import { readdirSync, readFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import type { KnowledgeChunk } from "../../domain/types.js";
import { sanitizePolicyText } from "./sanitizePolicy.js";

interface PolicyDoc {
  id: string;
  title: string;
  source: string;
  text: string;
}

export interface PolicyIndex {
  search(query: string, limit?: number): KnowledgeChunk[];
}

const SUPPORTED_EXTENSIONS = new Set([".md", ".txt", ".markdown"]);

/**
 * Índice lexical simples (BM25-lite) sobre arquivos TXT/Markdown em data/policies.
 * Suficiente para o take-home; trocável por embeddings.
 */
export function createBm25PolicyIndex(
  policiesDir = resolve(process.cwd(), "data/policies"),
): PolicyIndex {
  const docs = loadPolicyDocuments(policiesDir);
  const n = docs.length;
  const df = new Map<string, number>();
  const tokenized = docs.map((doc) => {
    const titleTokens = tokenize(doc.title);
    const bodyTokens = tokenize(doc.text);
    const unique = new Set([...titleTokens, ...bodyTokens]);
    for (const term of unique) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
    return { titleTokens, bodyTokens };
  });

  return {
    search(query, limit = 3) {
      const terms = tokenize(query);
      if (terms.length === 0 || n === 0) return [];

      return docs
        .map((doc, i) => {
          const { titleTokens, bodyTokens } = tokenized[i]!;
          const score =
            terms.reduce((acc, term) => {
              const tfBody = bodyTokens.filter((t) => t === term).length;
              const tfTitle = titleTokens.filter((t) => t === term).length;
              const tf = tfBody + tfTitle * 3;
              if (tf === 0) return acc;
              const docFreq = df.get(term) ?? 0;
              const idf = Math.log(1 + (n - docFreq + 0.5) / (docFreq + 0.5));
              return acc + ((tf * (1.5 + 1)) / (tf + 1.5)) * idf;
            }, 0) / terms.length;

          return {
            id: doc.id,
            title: doc.title,
            source: doc.source,
            text: doc.text,
            score,
          } satisfies KnowledgeChunk;
        })
        .filter((chunk) => chunk.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    },
  };
}

export function loadPolicyDocuments(policiesDir: string): PolicyDoc[] {
  const files = readdirSync(policiesDir)
    .filter((name) => SUPPORTED_EXTENSIONS.has(extname(name).toLowerCase()))
    .sort();

  const docs: PolicyDoc[] = [];

  for (const file of files) {
    const fullPath = resolve(policiesDir, file);
    const raw = readFileSync(fullPath, "utf-8");
    const source = basename(file);
    const chunks = chunkDocument(raw, source);
    docs.push(...chunks);
  }

  return docs;
}

/** Quebra MD por headings ##/# e TXT por blocos separados por linha em branco. */
function chunkDocument(raw: string, source: string): PolicyDoc[] {
  const normalized = raw.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const isMarkdown = /\.md$|\.markdown$/i.test(source);
  const parts = isMarkdown ? splitMarkdownSections(normalized) : splitParagraphs(normalized);
  const fallbackTitle = titleFromFilename(source);

  return parts.map((part, index) => {
    const sanitized = sanitizePolicyText(part.body);
    return {
      id: `${source}#${index + 1}`,
      title: part.title || fallbackTitle,
      source,
      text: sanitized.text,
    };
  });
}

function splitMarkdownSections(text: string): Array<{ title: string; body: string }> {
  const lines = text.split("\n");
  const sections: Array<{ title: string; body: string }> = [];
  let title = "";
  let body: string[] = [];

  const flush = () => {
    const joined = body.join("\n").trim();
    if (joined) sections.push({ title: title || "Introdução", body: stripMarkdown(joined) });
    body = [];
  };

  for (const line of lines) {
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      title = heading[2]!.trim();
      continue;
    }
    body.push(line);
  }
  flush();
  return sections;
}

function splitParagraphs(text: string): Array<{ title: string; body: string }> {
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  if (blocks.length === 0) return [];

  const docTitle = blocks[0]!.split("\n")[0]!.trim();
  return blocks.map((block, index) => ({
    title: index === 0 ? docTitle : `${docTitle} — trecho ${index + 1}`,
    body: block,
  }));
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/^\s*\d+\)\s+/gm, "")
    .trim();
}

function titleFromFilename(source: string): string {
  return basename(source, extname(source))
    .replace(/^\d+-/, "")
    .replace(/[-_]/g, " ");
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^a-z0-9]+/u)
    .filter(Boolean);
}
