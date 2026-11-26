/**
 * Hardening contra injeção de prompt em documentos de política.
 * Remove padrões de instrução; o envelope POLICY_EXCERPT é opcional (a tool decide).
 */

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/gi,
  /disregard\s+(all\s+)?(previous|prior|above)\s+instructions?/gi,
  /esque[cç]a\s+(todas?\s+as?\s+)?instru[cç][oõ]es\s+anteriores/gi,
  /ignore\s+as\s+instru[cç][oõ]es\s+anteriores/gi,
  /\byou\s+are\s+now\b/gi,
  /\bact\s+as\b/gi,
  /\bsystem\s*:/gi,
  /\bassistant\s*:/gi,
  /\bnew\s+instructions?\s*:/gi,
  /\binstru[cç][oõ]es?\s+do\s+sistema\s*:/gi,
  /\breveal\s+(your\s+)?(system\s+)?prompt\b/gi,
  /\bmostre\s+(o\s+)?(system\s+)?prompt\b/gi,
  /\bdo\s+not\s+cite\s+(the\s+)?source\b/gi,
  /\bn[aã]o\s+cite\s+(a\s+)?fonte\b/gi,
  /\bcancel\s+all\s+orders\b/gi,
  /\bcancele\s+todos\s+os\s+pedidos\b/gi,
];

export const POLICY_EXCERPT_START = "<<<POLICY_EXCERPT>>>";
export const POLICY_EXCERPT_END = "<<<END_POLICY_EXCERPT>>>";

/** Aliases legados. */
export const UNTRUSTED_START = POLICY_EXCERPT_START;
export const UNTRUSTED_END = POLICY_EXCERPT_END;

export interface SanitizedPolicyText {
  text: string;
  strippedInjectionAttempts: number;
  untrusted: true;
}

export function unwrapIfNeeded(text: string): string {
  return text
    .replaceAll(POLICY_EXCERPT_START, "")
    .replaceAll(POLICY_EXCERPT_END, "")
    .replaceAll("<<<UNTRUSTED_POLICY_DATA>>>", "")
    .replaceAll("<<<END_UNTRUSTED_POLICY_DATA>>>", "")
    .trim();
}

/** Remove padrões de injeção; mantém o texto factual legível para o LLM. */
export function stripPolicyInjections(raw: string): SanitizedPolicyText {
  let stripped = 0;
  let cleaned = unwrapIfNeeded(raw);

  for (const pattern of INJECTION_PATTERNS) {
    pattern.lastIndex = 0;
    const before = cleaned;
    cleaned = cleaned.replace(pattern, "[INSTRUCAO_NAO_CONFIAVEL_REMOVIDA]");
    if (cleaned !== before) stripped += 1;
  }

  cleaned = cleaned
    .replaceAll(POLICY_EXCERPT_START, "[DELIMITADOR_REMOVIDO]")
    .replaceAll(POLICY_EXCERPT_END, "[DELIMITADOR_REMOVIDO]");

  return {
    text: cleaned.trim(),
    strippedInjectionAttempts: stripped,
    untrusted: true,
  };
}

/** @deprecated Prefer stripPolicyInjections + metadata na tool. Mantido para testes. */
export function sanitizePolicyText(raw: string, options?: { wrap?: boolean }): SanitizedPolicyText {
  const stripped = stripPolicyInjections(raw);
  if (options?.wrap === false) return stripped;
  return {
    ...stripped,
    text: `${POLICY_EXCERPT_START}\n${stripped.text}\n${POLICY_EXCERPT_END}`,
  };
}

export function looksLikeInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}
