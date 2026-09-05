import { useEffect, useState } from 'react';
import { ApiError, fetchSituationReport } from '../api/client';
import type { SituationReport } from '../api/types';

export interface SituationReportState {
  loading: boolean;
  error: string | null;
  /** null tant qu'aucun compte rendu n'a ete genere (absence honnete, pas une erreur). */
  report: SituationReport | null;
  reload: () => void;
}

/**
 * Charge le dernier compte rendu de situation redige par DeepSeek
 * (Phase 6, cf. api/client.ts). Meme forme que les autres hooks de
 * chargement (useRecentEvents, useDiversifiedEvents) -- un seul appel au
 * montage, reload() pour rafraichir manuellement.
 */
export function useSituationReport(): SituationReportState {
  const [report, setReport] = useState<SituationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchSituationReport()
      .then((result) => {
        if (cancelled) return;
        setReport(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Impossible de joindre l'API CyberWatch.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return { loading, error, report, reload: () => setAttempt((a) => a + 1) };
}
