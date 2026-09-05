import type { EventsPage, SituationReport } from './types';

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

/**
 * Recupere les evenements reels d'une seule source (le 1er tag = nom de la
 * source, cf. classifyEvent.buildTags ; le backend filtre via
 * `$n = ANY(tags)`, cf. src/database/repositories/cyberEvents.ts). Utilise
 * pour construire un echantillon equilibre entre sources plutot que de
 * prendre le top N global -- GDELT (toutes les 15 min, gros volume GKG)
 * ecrase sinon systematiquement CERT-FR/CISA KEV/MSRC (toutes les 2h,
 * quelques items par passage) dans un simple tri par recence.
 */
export async function fetchEventsBySource(sourceTag: string, limit = 20): Promise<EventsPage> {
  const response = await fetch(`${API_BASE_URL}/api/v1/events?limit=${limit}&tag=${encodeURIComponent(sourceTag)}`);

  if (!response.ok) {
    throw new ApiError(`L'API a repondu ${response.status} ${response.statusText}`, response.status);
  }

  return (await response.json()) as EventsPage;
}

/**
 * Recupere le dernier compte rendu de situation redige par DeepSeek
 * (Phase 6, cf. GET /api/v1/situation-report cote backend). `report` peut
 * etre null (DEEPSEEK_API_KEY absente cote serveur, ou aucun passage
 * planifie n'a encore eu lieu) -- ce n'est pas une erreur, juste l'absence
 * honnete de contenu genere pour l'instant.
 */
export async function fetchSituationReport(): Promise<SituationReport | null> {
  const response = await fetch(`${API_BASE_URL}/api/v1/situation-report`);

  if (!response.ok) {
    throw new ApiError(`L'API a repondu ${response.status} ${response.statusText}`, response.status);
  }

  const body = (await response.json()) as { report: SituationReport | null };
  return body.report;
}
