import { readdirSync, readFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import type { KnowledgeChunk } from "../../domain/types.js";
import { stripPolicyInjections } from "./sanitizePolicy.js";

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
 * Índice lexical (BM25-lite): 1 documento = 1 arquivo de política.
 * Evita o bug de devolver só o cabeçalho do Markdown sem o corpo útil.
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
              const tf = tfBody + tfTitle * 2;
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

  return files.map((file) => {
    const fullPath = resolve(policiesDir, file);
    const raw = readFileSync(fullPath, "utf-8");
    const source = basename(file);
    const title = extractTitle(raw) || titleFromFilename(source);
    const body = stripMarkdown(raw);
    const sanitized = stripPolicyInjections(body);

    return {
      id: source,
      title,
      source,
      text: sanitized.text,
    };
  });
}

function extractTitle(raw: string): string | undefined {
  const heading = /^(#{1,3})\s+(.+)$/m.exec(raw);
  if (heading?.[2]) return heading[2].trim();
  const firstLine = raw.split(/\r?\n/).find((l) => l.trim().length > 0);
  return firstLine?.trim();
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "")
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
