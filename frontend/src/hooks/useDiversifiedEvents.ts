import { useEffect, useState } from 'react';
import { fetchEventsBySource } from '../api/client';
import type { CyberEvent } from '../api/types';
import { SOURCE_META } from '../domain';

export interface DiversifiedEventsState {
  loading: boolean;
  /** null si au moins une source a repondu -- une erreur totale n'arrive que si toutes ont echoue. */
  error: string | null;
  events: CyberEvent[];
  /** Sources reellement interrogees qui n'ont renvoye aucun evenement (ex: bleepingcomputer/hackernews, sans collecteur implemente). */
  emptySources: string[];
  /**
   * Nombre reel d'evenements renvoyes par source AVANT fusion/deduplication
   * (donc avant d'etre tronque par perSourceLimit sur l'affichage) -- sert a
   * afficher une vraie repartition, pas une estimation.
   */
  countsBySource: Record<string, number>;
  /** Sources dont le compte ci-dessus est plafonne par perSourceLimit (nextCursor non-null cote API) -- le vrai total est superieur. */
  cappedSources: string[];
  reload: () => void;
}

function eventTimestamp(event: CyberEvent): number {
  return new Date(event.publishedAt ?? event.createdAt).getTime();
}

/**
 * Recupere un echantillon reel de CHAQUE source active (cf. fetchEventsBySource)
 * plutot que le top N global -- evite que le volume GDELT (15 min, gros lots
 * GKG) ne masque CERT-FR/CISA KEV/MSRC (2h, quelques items) dans une simple
 * liste triee par recence. Fusionne, deduplique par id et trie par recence.
 * Les sources sans collecteur implemente (aucun evenement reel) ressortent
 * simplement vides -- rien n'est invente pour les remplir.
 */
export function useDiversifiedEvents(perSourceLimit = 15): DiversifiedEventsState {
  const [events, setEvents] = useState<CyberEvent[]>([]);
  const [emptySources, setEmptySources] = useState<string[]>([]);
  const [countsBySource, setCountsBySource] = useState<Record<string, number>>({});
  const [cappedSources, setCappedSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const sourceTags = Object.keys(SOURCE_META);

    Promise.allSettled(sourceTags.map((tag) => fetchEventsBySource(tag, perSourceLimit))).then((results) => {
      if (cancelled) return;

      const merged = new Map<string, CyberEvent>();
      const empty: string[] = [];
      const counts: Record<string, number> = {};
      const capped: string[] = [];
      let anySucceeded = false;

      results.forEach((result, i) => {
        const tag = sourceTags[i];
        if (result.status !== 'fulfilled') return;
        anySucceeded = true;
        counts[tag] = result.value.items.length;
        if (result.value.items.length === 0) {
          empty.push(tag);
        }
        if (result.value.nextCursor !== null) {
          capped.push(tag);
        }
        for (const event of result.value.items) {
          merged.set(event.id, event);
        }
      });

      if (!anySucceeded) {
        setError("Impossible de joindre l'API CyberWatch.");
        setEvents([]);
      } else {
        setEvents([...merged.values()].sort((a, b) => eventTimestamp(b) - eventTimestamp(a)));
        setEmptySources(empty);
        setCountsBySource(counts);
        setCappedSources(capped);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [perSourceLimit, attempt]);

  return {
    loading,
    error,
    events,
    emptySources,
    countsBySource,
    cappedSources,
    reload: () => setAttempt((a) => a + 1),
  };
}
