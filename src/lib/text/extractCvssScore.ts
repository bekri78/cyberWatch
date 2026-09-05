/**
 * Recherche une mention explicite "CVSS X.X" dans un texte (cf.
 * src/collectors/msrc/normalize.ts, qui l'ecrit deliberement dans
 * contentExcerpt). Volontairement un pattern strict (espace, pas ":")
 * pour ne jamais confondre avec un vecteur CVSS brut ("CVSS:3.1/...")
 * qui apparait aussi parfois dans nos textes sources.
 */
const CVSS_SCORE_PATTERN = /\bCVSS\s+(\d+(?:\.\d+)?)\b/i;

export function extractCvssScore(text: string): number | null {
  const match = CVSS_SCORE_PATTERN.exec(text);
  if (!match) return null;

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}
