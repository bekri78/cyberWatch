import { Icon } from '../components/Icon';
import { Layout } from '../components/Layout';
import { ErrorState, LoadingState } from '../components/RequestState';
import { WorldMap } from '../components/WorldMap';
import { useRecentEvents } from '../hooks/useRecentEvents';
import { countEventsByCountry } from '../posture';

function CountryTable({ counts }: { counts: Map<string, number> }) {
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  if (rows.length === 0) {
    return (
      <div className="cw-empty">
        <Icon name="globe" size={20} color="var(--text-quaternary)" />
        <div className="cw-empty-title">Aucun pays localise</div>
        <p className="cw-empty-desc">
          Seule la source GDELT fournit une localisation reelle des evenements pour l'instant.
        </p>
      </div>
    );
  }

  return (
    <div className="cw-panel" style={{ padding: 6 }}>
      {rows.map(([country, count]) => (
        <div
          key={country}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '9px 12px',
            fontSize: 13,
          }}
        >
          <span style={{ color: 'var(--text-secondary)' }}>{country}</span>
          <span style={{ color: 'var(--text-quaternary)', fontVariantNumeric: 'tabular-nums' }}>
            {count} evenement{count > 1 ? 's' : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

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
        <>
          <div className="cw-panel">
            <div className="cw-section-eyebrow">
              <Icon name="globe" size={13} color="var(--accent)" />
              Localisation
            </div>
            <div className="cw-section-title" style={{ marginBottom: 12 }}>
              Evenements par pays
            </div>
            <p className="cw-section-desc" style={{ marginBottom: 14 }}>
              Seule la source GDELT fournit une localisation reelle (champ V1LOCATIONS) pour l'instant --
              les autres sources n'ont pas de champ geographique structure.
            </p>
            <WorldMap counts={countryCounts} height={480} />
          </div>

          <section>
            <div className="cw-section-head">
              <div>
                <div className="cw-section-eyebrow">
                  <Icon name="activity" size={13} color="var(--accent)" />
                  Detail
                </div>
                <h2 className="cw-section-title">Pays les plus cites</h2>
              </div>
            </div>
            <CountryTable counts={countryCounts} />
          </section>
        </>
      )}
    </Layout>
  );
}
