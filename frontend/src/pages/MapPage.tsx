import { Icon } from '../components/Icon';
import { Layout } from '../components/Layout';
import { ErrorState, LoadingState } from '../components/RequestState';
import { WorldMap } from '../components/WorldMap';
import { useRecentEvents } from '../hooks/useRecentEvents';
import { countEventsByCountry } from '../posture';

export function MapPage() {
  const { loading, error, events, reload } = useRecentEvents(100);
  const countryCounts = countEventsByCountry(events);

  const status = loading
    ? undefined
    : error
      ? 'API injoignable'
      : `${countryCounts.size} pays cites sur ${events.length} evenements`;

  return (
    <Layout title="Carte" subtitle="Repartition geographique des evenements reels" status={status}>
      {loading && <LoadingState label="Chargement des evenements reels depuis l'API CyberWatch…" />}
      {!loading && error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && (
        <div className="cw-panel">
          <div className="cw-section-eyebrow">
            <Icon name="globe" size={13} color="var(--accent)" />
            Localisation
          </div>
          <div className="cw-section-title" style={{ marginBottom: 12 }}>
            Pays cités dans la veille qualifiée
          </div>
          <p className="cw-section-desc" style={{ marginBottom: 14 }}>
            Les points représentent des pays mentionnés dans les publications GDELT, pas des lieux d’attaque confirmés.
            Les autres sources restent accessibles dans la vue Situation. Survolez un point pour le détail.
          </p>
          <WorldMap events={events} height={560} />
        </div>
      )}
    </Layout>
  );
}
