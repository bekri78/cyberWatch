import { useEffect, useState } from 'react';
import { ApiError, fetchRecentEvents } from '../api/client';
import type { CyberEvent } from '../api/types';

export interface RecentEventsState {
  loading: boolean;
  error: string | null;
  events: CyberEvent[];
  reload: () => void;
}

/**
 * Charge un echantillon reel d'evenements (les plus recents, cf.
 * client.ts) une fois au montage. Pas de rafraichissement automatique en
 * arriere-plan pour l'instant -- reload() permet un rechargement manuel.
 */
export function useRecentEvents(limit = 100): RecentEventsState {
  const [events, setEvents] = useState<CyberEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchRecentEvents(limit)
      .then((page) => {
        if (cancelled) return;
        setEvents(page.items);
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
  }, [limit, attempt]);

  return { loading, error, events, reload: () => setAttempt((a) => a + 1) };
}
