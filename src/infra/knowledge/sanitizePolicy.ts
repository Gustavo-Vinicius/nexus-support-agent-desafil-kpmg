/**
 * Hardening contra injeção de prompt em documentos de política.
 * Políticas são dados não confiáveis: neutraliza padrões de instrução e
 * envelopa o texto em delimitadores explícitos para o LLM.
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

export const UNTRUSTED_START = "<<<UNTRUSTED_POLICY_DATA>>>";
export const UNTRUSTED_END = "<<<END_UNTRUSTED_POLICY_DATA>>>";

export interface SanitizedPolicyText {
  text: string;
  strippedInjectionAttempts: number;
  untrusted: true;
}

/** Remove/neutraliza padrões típicos de prompt injection e envelopa como dado. */
export function sanitizePolicyText(raw: string): SanitizedPolicyText {
  let stripped = 0;
  let cleaned = raw;

  for (const pattern of INJECTION_PATTERNS) {
    const before = cleaned;
    cleaned = cleaned.replace(pattern, "[INSTRUCAO_NAO_CONFIAVEL_REMOVIDA]");
    if (cleaned !== before) stripped += 1;
  }

  // Evita que delimitadores no documento quebrem o envelope
  cleaned = cleaned
    .replaceAll(UNTRUSTED_START, "[DELIMITADOR_REMOVIDO]")
    .replaceAll(UNTRUSTED_END, "[DELIMITADOR_REMOVIDO]");

  const wrapped = `${UNTRUSTED_START}\n${cleaned.trim()}\n${UNTRUSTED_END}`;

  return {
    text: wrapped,
    strippedInjectionAttempts: stripped,
    untrusted: true,
  };
}

export function looksLikeInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}
