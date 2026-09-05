import { EventList } from '../components/EventList';
import { Icon } from '../components/Icon';
import { Layout } from '../components/Layout';
import { ErrorState, LoadingState } from '../components/RequestState';
import { SummaryPlaceholder } from '../components/SummaryPlaceholder';
import { PostureBanner } from '../components/PostureBanner';
import { useRecentEvents } from '../hooks/useRecentEvents';
import { buildIndicators, derivePosture } from '../posture';

export function SituationPage() {
  const { loading, error, events, reload } = useRecentEvents(100);

  const posture = derivePosture(events, events.length);
  const indicators = buildIndicators(events);

  const status = loading ? undefined : error ? 'API injoignable' : `${events.length} evenements charges`;

  return (
    <Layout title="Situation" subtitle="Vue d'ensemble de la veille cyber" status={status}>
      {loading && <LoadingState label="Chargement des evenements reels depuis l'API CyberWatch…" />}
      {!loading && error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && (
        <>
          <PostureBanner posture={posture} indicators={indicators} />
          <SummaryPlaceholder />
          <section>
            <div className="cw-section-head">
              <div>
                <div className="cw-section-eyebrow">
                  <Icon name="activity" size={13} color="var(--accent)" />
                  Fenetre glissante
                </div>
                <h2 className="cw-section-title">Derniers evenements</h2>
                <p className="cw-section-desc">
                  Les {Math.min(8, events.length)} evenements les plus recents, toutes sources confondues.
                </p>
              </div>
            </div>
            <EventList events={events} limit={8} />
          </section>
        </>
      )}
    </Layout>
  );
}
