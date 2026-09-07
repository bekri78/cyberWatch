import { useEffect, useState } from 'react';
import { fetchOverview, fetchUnqualified } from '../api/client';
import type { EventsPage, Overview } from '../api/types';
import { EventList } from './EventList';
import { ErrorState, LoadingState } from './RequestState';

export function QualityOverview() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [queue, setQueue] = useState<'pending' | 'failed' | null>(null);
  const [page, setPage] = useState<EventsPage | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchOverview().then((value) => { if (!cancelled) setOverview(value); })
      .catch(() => { if (!cancelled) setError('Les indicateurs sont indisponibles.'); });
    return () => { cancelled = true; };
  }, [attempt]);

  useEffect(() => {
    let cancelled = false;
    setPage(null);
    setQueueError(null);
    if (queue) fetchUnqualified(queue).then((value) => { if (!cancelled) setPage(value); })
      .catch(() => { if (!cancelled) setQueueError('La file de qualification est indisponible.'); });
    return () => { cancelled = true; };
  }, [queue, attempt]);

  if (error) return <ErrorState message={error} onRetry={() => setAttempt((a) => a + 1)} />;
  if (!overview) return <LoadingState label="Calcul des indicateurs sur 24 heures…" />;
  const tiles = [
    ['Publications qualifiées', overview.total], ['Sévérité critique', overview.critical],
    ['Sévérité élevée', overview.high], ['Pays cités', overview.countries], ['Sources représentées', overview.sources],
  ] as const;
  return <section className="cw-panel" aria-label="Couverture et qualification">
    <h2 className="cw-section-title">Veille qualifiée · 24 heures</h2>
    <p className="cw-section-desc">
      Du {new Date(overview.windowStart).toLocaleString('fr-FR')} au {new Date(overview.windowEnd).toLocaleString('fr-FR')}.
      {' '}Selon la date de publication, ou de collecte si elle est inconnue. Ces volumes ne mesurent pas le risque de votre organisation.
    </p>
    <div className="cw-indicators" style={{ marginTop: 12 }}>
      {tiles.map(([label, value]) => <div className="cw-indicator" key={label}>
        <div className="cw-indicator-value">{value}</div><div className="cw-indicator-label">{label}</div>
      </div>)}
    </div>
    <div className="mt-4 flex flex-wrap gap-3 text-sm text-secondary">
      <button className="rounded-lg border border-border-standard px-3 py-1.5 hover:bg-[var(--s2)]" type="button" aria-pressed={queue === 'pending'} onClick={() => setQueue(queue === 'pending' ? null : 'pending')}>
        À qualifier : {overview.pending}
      </button>
      <button className="rounded-lg border border-border-standard px-3 py-1.5 hover:bg-[var(--s2)]" type="button" aria-pressed={queue === 'failed'} onClick={() => setQueue(queue === 'failed' ? null : 'failed')}>
        Relectures en échec : {overview.failed}
      </button>
      <button className="rounded-lg border border-border-standard px-3 py-1.5 hover:bg-[var(--s2)]" type="button" onClick={() => setAttempt((a) => a + 1)}>Actualiser les indicateurs et la file</button>
    </div>
    <p className="cw-section-desc mt-2">File sur tout l’historique, exclue du catalogue principal, de la carte et des nouveaux comptes rendus.
      {overview.oldestPendingAt && ` Plus ancienne collecte en attente : ${new Date(overview.oldestPendingAt).toLocaleString('fr-FR')}.`}
    </p>
    {queue && <div className="mt-4">
      <p className="text-sm text-secondary mb-2">{queue === 'failed' ? 'Relecture en échec — nouvelle tentative planifiée.' : 'Informations non qualifiées — pertinence et sévérité provisoires.'}</p>
      {queueError ? <ErrorState message={queueError} onRetry={() => setAttempt((a) => a + 1)} />
        : page ? <><EventList events={page.items} limit={20} />{page.nextCursor && <p className="cw-section-desc">20 dernières publications affichées ; la file contient potentiellement d’autres éléments.</p>}</>
          : <LoadingState label="Chargement de la file…" />}
    </div>}
  </section>;
}
