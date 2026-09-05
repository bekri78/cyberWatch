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
            Evenements geolocalises
          </div>
          <p className="cw-section-desc" style={{ marginBottom: 14 }}>
            Seule la source GDELT fournit une localisation reelle (champ V1LOCATIONS) pour l'instant -- les
            autres sources n'ont pas de champ geographique structure. Survolez un point pour le detail.
          </p>
          <WorldMap events={events} height={560} />
        </div>
      )}
    </Layout>
  );
}
