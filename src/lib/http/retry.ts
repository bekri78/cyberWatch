/**
 * Retry simple avec delai fixe. Partage entre tous les collecteurs
 * (cf. document d'architecture, section 03 : lib/http centralise la logique
 * reseau plutot que de la dupliquer dans chaque collecteur).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 2,
  delayMs = 1000,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}
