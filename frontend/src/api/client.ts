import type { EventsPage } from './types';

/**
 * URL du vrai backend Railway. Surchageable via VITE_API_BASE_URL (fichier
 * .env local, ou variable d'environnement du build GitHub Actions) --
 * jamais de donnee simulee en repli : si l'API est injoignable, l'appelant
 * doit l'afficher comme une erreur reelle, pas la masquer avec un jeu de
 * demonstration (cf. regle projet : donnee reelle uniquement).
 */
const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  'https://cyberwatch-production-7503.up.railway.app';

export class ApiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Recupere une page d'evenements reels. limit=100 (maximum autorise par
 * l'API, cf. querystring.limit.maximum) donne un echantillon assez large
 * pour calculer une posture/des indicateurs representatifs sans multiplier
 * les appels -- cette page ne fait qu'un seul appel reseau.
 */
export async function fetchRecentEvents(limit = 100): Promise<EventsPage> {
  const response = await fetch(`${API_BASE_URL}/api/v1/events?limit=${limit}`);

  if (!response.ok) {
    throw new ApiError(`L'API a repondu ${response.status} ${response.statusText}`, response.status);
  }

  return (await response.json()) as EventsPage;
}
