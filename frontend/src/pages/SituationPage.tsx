import { useMemo, useRef, useState } from 'react';
import { EventList } from '../components/EventList';
import { Icon } from '../components/Icon';
import { Layout } from '../components/Layout';
import { ErrorState, LoadingState } from '../components/RequestState';
import { SourceBreakdown } from '../components/SourceBreakdown';
import { SituationReportPanel } from '../components/SituationReportPanel';
import { QualityOverview } from '../components/QualityOverview';
import { SOURCE_META } from '../domain';
import { useDiversifiedEvents } from '../hooks/useDiversifiedEvents';
import { EventDetailPanel } from '../components/EventDetailPanel';
import type { CyberEvent } from '../api/types';
import { Link } from 'react-router-dom';
import '../exploration.css';
import '../situation.css';
import { useSituationReport } from '../hooks/useSituationReport';

export function SituationPage() {
  // État du catalogue qualifié. Les indicateurs ont leur propre agrégation serveur.
  const [selected, setSelected] = useState<CyberEvent | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [priority, setPriority] = useState('all');
  function select(event: CyberEvent) { returnFocus.current = document.activeElement as HTMLElement; setSelected(event); }
  function close() { setSelected(null); returnFocus.current?.focus(); }

  // Echantillon equilibre par source (cf. useDiversifiedEvents) : evite que
  // le volume GDELT ne masque CERT-FR/CISA KEV/MSRC dans la liste affichee.
  const diversified = useDiversifiedEvents(15);

  // Compte rendu redige par DeepSeek (Phase 6) -- charge independamment du
  // reste : son absence/erreur ne doit jamais bloquer l'affichage des
  // evenements reels, qui restent la donnee principale de la page.
  const situationReport = useSituationReport();

  // Filtre optionnel sur une seule source, pilote par les chips SourceBreakdown.
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const filteredEvents = useMemo(
    () => diversified.events.filter((event) => (!sourceFilter || event.tags.includes(sourceFilter)) && (priority === 'all' || (priority === 'priority' ? ['critical', 'high'].includes(event.severity) : priority === 'watch' ? event.severity === 'medium' : event.severity === 'low'))),
    [diversified.events, sourceFilter, priority],
  );

  const activeSourceCount = Object.values(diversified.countsBySource).filter((count) => count > 0).length;

  return (
    <Layout title="Situation" subtitle="Comprendre l’essentiel, approfondir les faits" wide>
      <div className="ex-workspace st-workspace">
        <header className="st-heading"><div><div className="ex-eyebrow">LE POINT CYBER</div><h1>Votre veille, mise en perspective.</h1><p>Les faits à comprendre aujourd’hui et les publications pour aller plus loin.</p></div><Link className="ex-button" to="/exploration">Explorer la carte <Icon name="arrowRight" size={14} /></Link></header>
          {situationReport.error
            ? <ErrorState message={situationReport.error} onRetry={situationReport.reload} />
            : <SituationReportPanel loading={situationReport.loading} report={situationReport.report} />}
          <div className="st-metrics"><QualityOverview mode="metrics" /></div>
          <section className="st-publications">
            <div className="cw-section-head">
              <div>
                <div className="cw-section-eyebrow">
                  <Icon name="activity" size={13} color="var(--accent)" />
                  APPROFONDIR
                </div>
                <h2 className="cw-section-title">Les publications à lire</h2>
                <p className="cw-section-desc">
                  Publications qualifiées les plus récentes par source, toutes dates confondues
                  {' '}({activeSourceCount} source{activeSourceCount > 1 ? 's représentées' : ' représentée'} sur {Object.keys(SOURCE_META).length} enregistrées).
                  {' '}Les compteurs portent sur cet échantillon, distinct des indicateurs sur 24 heures.
                </p>
              </div>
            </div>
            <div className="st-priorities" role="group" aria-label="Priorité de lecture">
              {[['all', 'Toutes les publications', 'Un aperçu équilibré entre les sources.'], ['priority', 'À examiner en priorité', 'Sévérité élevée ou critique dans les données.'], ['watch', 'À surveiller', 'Sévérité modérée dans les données.'], ['info', 'Pour information', 'Sévérité faible dans les données.']].map(([value, label, reason]) => <button key={value} aria-pressed={priority === value} onClick={() => setPriority(value)}><strong>{label}</strong><span>{reason}</span></button>)}
            </div>
            {diversified.loading && <LoadingState label="Chargement par source…" />}
            {!diversified.loading && diversified.error && (
              <ErrorState message={diversified.error} onRetry={diversified.reload} />
            )}
            {!diversified.loading && !diversified.error && (
              <div className="flex flex-col gap-3">
                <SourceBreakdown
                  counts={diversified.countsBySource}
                  cappedSources={diversified.cappedSources}
                  emptySources={diversified.emptySources}
                  failedSources={diversified.failedSources}
                  total={diversified.events.length}
                  activeFilter={sourceFilter}
                  onFilterChange={setSourceFilter}
                />
                <EventList events={filteredEvents} limit={sourceFilter ? 20 : 8} onSelect={select} />
                <Link className="st-more" to="/exploration">Consulter tout le flux et ses filtres <Icon name="arrowRight" size={14} /></Link>
              </div>
            )}
          </section>
          <details className="st-quality"><summary>Couverture et qualité de collecte <span>Consulter les publications en attente et les erreurs</span></summary><QualityOverview mode="queue" /></details>
          {selected && <div className="st-detail"><EventDetailPanel event={selected} onClose={close} /></div>}
      </div>
    </Layout>
  );
}
