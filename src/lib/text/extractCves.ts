const CVE_PATTERN = /CVE-\d{4}-\d{4,7}/gi;

/**
 * Extrait les identifiants CVE d'un texte libre, dedupliques et normalises
 * en majuscules. Purement deterministe (regex), pas d'appel IA -- reutilise
 * par la promotion raw_items -> cyber_events (Phase 4) et plus tard par les
 * autres collecteurs et l'enrichissement DeepSeek (Phase 5).
 */
export function extractCves(text: string): string[] {
  const matches = text.match(CVE_PATTERN) ?? [];
  return [...new Set(matches.map((match) => match.toUpperCase()))];
}
