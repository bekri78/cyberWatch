import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Icon } from '../components/Icon';
import { EventDetailPanel } from '../components/EventDetailPanel';
import { CATEGORY_LABELS, SEVERITY_LABELS, SOURCE_META, sourceFromTags } from '../domain';
import type { CyberEvent } from '../api/types';
import { useExploration } from '../hooks/useExploration';
import '../exploration.css';

const ExplorationMap = lazy(() => import('../components/ExplorationMap'));
const FILTERS = ['q', 'category', 'severity', 'source', 'country', 'location'] as const;

export default function ExplorationPage() {
  const [search, setSearch] = useSearchParams();
  const [anchor, setAnchor] = useState(() => new Date().toISOString());
  const [selected, setSelected] = useState<CyberEvent | null>(null);
  const [draft, setDraft] = useState(search.get('q') ?? '');
  const searchText = search.get('q') ?? '';
  useEffect(() => { setDraft(searchText); }, [searchText]);
  const selectedButton = useRef<HTMLButtonElement | null>(null);
  const period = ['24h', '7d', '30d'].includes(search.get('period') ?? '') ? search.get('period')! : '7d';
  const params = useMemo(() => {
    const p = new URLSearchParams({ period, until: anchor });
    FILTERS.forEach((key) => { const value = search.get(key); if (value) p.set(key, value); });
    return p;
  }, [search, anchor, period]);
  const { data, loading, more, error, loadMore } = useExploration(params);
  const country = search.get('country') ?? '';
  const location = search.get('location') ?? 'all';
  const filterCount = FILTERS.filter((key) => search.get(key) && search.get(key) !== 'all').length;
  function change(key: string, value: string) {
    const next = new URLSearchParams(search);
    if (value && value !== 'all') next.set(key, value); else next.delete(key);
    if (key === 'country' && value) next.delete('location');
    if (key === 'location' && value === 'unknown') next.delete('country');
    setSelected(null); setSearch(next);
  }
  function reset() { setSearch({ period }); setDraft(''); setSelected(null); }
  function closeDetail() { setSelected(null); selectedButton.current?.focus(); }
  const selectedVisible = selected && data?.items.some((item) => item.id === selected.id) ? selected : null;
  const bins = Array.from({ length: 24 }, (_, i) => data?.timeline.find((b) => b.bucket === i)?.count ?? 0);
  const maximum = Math.max(1, ...bins);
  const windowLabel = data ? `${new Date(data.windowStart).toLocaleDateString('fr-FR')} — ${new Date(data.windowEnd).toLocaleDateString('fr-FR')}` : 'Chargement de la période';
  return <Layout title="Exploration" subtitle="Carte et publications qualifiées" wide>
    <div className="ex-workspace">
      <header className="ex-heading"><div><div className="ex-eyebrow"><span className="ex-status-dot" />OBSERVATOIRE CYBER</div><h1>Comprendre où, explorer les faits.</h1><p>Une lecture géographique de votre veille, reliée aux publications sources.</p></div>
        <button className="ex-button" disabled={loading} onClick={() => { setSelected(null); setAnchor(new Date().toISOString()); }}><Icon name="refresh" size={14} />Actualiser</button>
      </header>
      <form className="ex-toolbar" onSubmit={(e) => { e.preventDefault(); change('q', draft.trim()); }}>
        <div className="ex-periods" role="group" aria-label="Période">{[['24h','24 heures'],['7d','7 jours'],['30d','30 jours']].map(([value,label]) => <button type="button" aria-pressed={period === value} key={value} onClick={() => change('period', value)}>{label}</button>)}</div>
        <label className="ex-search"><Icon name="target" size={16} /><input aria-label="Rechercher dans la veille" placeholder="Rechercher un sujet, un produit, une CVE…" maxLength={160} value={draft} onChange={(e) => setDraft(e.target.value)} /><button type="submit" aria-label="Lancer la recherche"><Icon name="arrowRight" size={16} /></button></label>
        <button type="button" className="ex-reset" disabled={!filterCount} onClick={reset}>Réinitialiser{filterCount > 0 && ` (${filterCount})`}</button>
      </form>
      <div className="ex-filters">
        <label>Source<select value={search.get('source') ?? ''} onChange={(e) => change('source', e.target.value)}><option value="">Toutes les sources</option>{Object.entries(SOURCE_META).filter(([key]) => !['bleepingcomputer','hackernews'].includes(key)).map(([key,meta]) => <option key={key} value={key}>{meta.label}</option>)}</select></label>
        <label>Catégorie<select value={search.get('category') ?? ''} onChange={(e) => change('category', e.target.value)}><option value="">Toutes les catégories</option>{Object.entries(CATEGORY_LABELS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Sévérité<select value={search.get('severity') ?? ''} onChange={(e) => change('severity', e.target.value)}><option value="">Tous les niveaux</option>{Object.entries(SEVERITY_LABELS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Pays cité<select value={country} onChange={(e) => change('country', e.target.value)}><option value="">Tous les pays</option>{[...new Set([...(data?.countryOptions ?? []), ...(country ? [country] : [])])].map((name) => <option key={name}>{name}</option>)}</select></label>
      </div>
      <div className="ex-stats" aria-live="polite">
        <div><strong>{loading ? '—' : data?.total ?? '—'}</strong><span>publications qualifiées</span></div>
        <div><strong>{loading ? '—' : data?.countries.length ?? '—'}</strong><span>pays cités</span></div>
        <div><strong>{loading ? '—' : data?.high ?? '—'}</strong><span>sévérités élevées / critiques</span></div>
        <div className="ex-window"><Icon name="calendar" size={15} /><span>{windowLabel}<small>Comptages sur tous les résultats filtrés</small></span></div>
      </div>
      {error && <div className="ex-error" role="alert">{error}<button onClick={() => setAnchor(new Date().toISOString())}>Réessayer</button></div>}
      <div className={`ex-grid ${selectedVisible ? 'ex-grid--detail' : ''}`} aria-busy={loading}>
        <section className="ex-map-section" aria-label="Carte des pays cités">
          <div className="ex-panel-head"><div><Icon name="globe" size={15} /><h2>{country || 'Répartition mondiale'}</h2></div><span>PAYS CITÉS</span></div>
          <Suspense fallback={<div className="ex-map-placeholder">Chargement de la carte…</div>}><ExplorationMap countries={data?.countries ?? []} selected={country} onSelect={(name) => change('country', name === country ? '' : name)} /></Suspense>
          <div className="ex-map-legend"><span><i />Publications</span><span><i className="ex-orange" />Au moins une sévérité élevée / critique</span></div>
          <p className="ex-map-note">Pastilles au centre des pays cités. Elles ne représentent pas des lieux d’attaque confirmés.</p>
          <div className="ex-timeline"><div className="ex-timeline-heading"><span><Icon name="activity" size={14} />Rythme des publications</span><small>24 intervalles · selon la date de publication*</small></div>
            <div className="ex-bars" aria-label="Histogramme des publications">{bins.map((count,i) => {
              const date = data ? new Date(new Date(data.windowStart).getTime() + i * (new Date(data.windowEnd).getTime() - new Date(data.windowStart).getTime()) / 24).toLocaleString('fr-FR') : '';
              return <div className="ex-bar-slot" key={i} tabIndex={0} aria-label={`${date} : ${count} publications`} title={`${date} : ${count} publications`}><span style={{ height: `${count ? Math.max(5, count / maximum * 100) : 2}%` }} /></div>;
            })}</div><div className="ex-timeline-dates"><span>{data && new Date(data.windowStart).toLocaleDateString('fr-FR')}</span><span>{data && new Date(data.windowEnd).toLocaleDateString('fr-FR')}</span></div>
            <p className="ex-note">* Date de collecte utilisée si la date de publication est inconnue.</p>
          </div>
        </section>
        <section className="ex-feed" aria-label="Flux des publications">
          <div className="ex-panel-head"><div><Icon name="feed" size={15} /><h2>Le flux</h2></div><span>PLUS RÉCENT D’ABORD</span></div>
          <div className="ex-feed-tabs" role="group" aria-label="Couverture géographique">{[['all','Tout'],['cited','Pays cité'],['unknown','Sans pays cité']].map(([value,label]) => <button key={value} aria-pressed={location === value} onClick={() => change('location', value)}>{label}</button>)}</div>
          <div className="ex-feed-scroll">
            {loading && <div className="ex-empty" role="status"><Icon name="refresh" size={24} /><h3>Chargement de la veille…</h3></div>}
            {!loading && data?.total === 0 && <div className="ex-empty"><Icon name="eye" size={24} /><h3>Aucune publication sur ce périmètre</h3><p>Élargissez la période ou retirez un filtre. L’absence de publication ne signifie pas une absence de risque.</p><button className="ex-button" onClick={reset}>Effacer les filtres</button></div>}
            {data?.items.map((event) => <button className={`ex-event ${selectedVisible?.id === event.id ? 'is-selected' : ''}`} key={event.id} aria-pressed={selectedVisible?.id === event.id} onClick={(e) => { selectedButton.current = e.currentTarget; setSelected(event); }}>
              <div className="ex-event-top"><span>{sourceFromTags(event.tags).label}</span><span className={`ex-severity ex-severity--${event.severity}`}>{SEVERITY_LABELS[event.severity] ?? event.severity}</span></div>
              <h3>{event.title}</h3><div className="ex-event-bottom"><span>{new Date(event.publishedAt ?? event.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} · {CATEGORY_LABELS[event.category] ?? event.category}</span><Icon name="arrowRight" size={14} /></div>
              <p className="ex-event-countries"><Icon name="mapPin" size={11} />{event.countries.length ? event.countries.slice(0,3).join(' · ') + (event.countries.length > 3 ? ` +${event.countries.length - 3}` : '') : 'Pays non documenté'}</p>
            </button>)}
            {data?.nextCursor && <button className="ex-load-more" disabled={more} onClick={loadMore}>{more ? 'Chargement…' : 'Afficher les publications suivantes'}</button>}
          </div>
          <footer className="ex-feed-footer">{data ? `${data.items.length} sur ${data.total} publications` : '—'}<span>{data ? `${data.unknown} sans pays cité` : ''}</span></footer>
        </section>
        {selectedVisible && <EventDetailPanel event={selectedVisible} onClose={closeDetail} onCountry={(name) => change('country', name)} />}
      </div>
    </div>
  </Layout>;
}
