import { EventList } from '../components/EventList';
import { Icon } from '../components/Icon';
import { Layout } from '../components/Layout';
import { ErrorState, LoadingState } from '../components/RequestState';
import { SummaryPlaceholder } from '../components/SummaryPlaceholder';
import { PostureBanner } from '../components/PostureBanner';
import { SOURCE_META } from '../domain';
import { useDiversifiedEvents } from '../hooks/useDiversifiedEvents';
import { useRecentEvents } from '../hooks/useRecentEvents';
import { buildIndicators, derivePosture } from '../posture';

export function SituationPage() {
  // Fenetre brute (top 100 recence) : reflete le vrai volume/gravite reels
  // pour la posture -- la dominance GDELT y est une information reelle, pas
  // un biais a corriger.
  const { loading, error, events, reload } = useRecentEvents(100);

  // Echantillon equilibre par source (cf. useDiversifiedEvents) : evite que
  // le volume GDELT ne masque CERT-FR/CISA KEV/MSRC dans la liste affichee.
  const diversified = useDiversifiedEvents(15);

  const posture = derivePosture(events, events.length);
  const indicators = buildIndicators(events);
  const activeSourceCount = Object.keys(SOURCE_META).length - diversified.emptySources.length;

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
                  Echantillon par source
                </div>
                <h2 className="cw-section-title">Derniers evenements</h2>
                <p className="cw-section-desc">
                  Un echantillon recent de chaque source active ({activeSourceCount} sur {Object.keys(SOURCE_META).length}{' '}
                  enregistrees), pour que le volume GDELT ne masque pas CERT-FR/CISA KEV/MSRC.
                  {diversified.emptySources.length > 0 &&
                    ` Aucun collecteur implemente pour : ${diversified.emptySources
                      .map((tag) => SOURCE_META[tag]?.label ?? tag)
                      .join(', ')}.`}
                </p>
              </div>
            </div>
            {diversified.loading && <LoadingState label="Chargement par source…" />}
            {!diversified.loading && diversified.error && (
              <ErrorState message={diversified.error} onRetry={diversified.reload} />
            )}
            {!diversified.loading && !diversified.error && <EventList events={diversified.events} limit={8} />}
          </section>
        </>
      )}
    </Layout>
  );
}
