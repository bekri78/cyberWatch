import { useEffect, useRef } from 'react';
import type { CyberEvent } from '../api/types';
import { CATEGORY_LABELS, SEVERITY_LABELS, sourceFromTags } from '../domain';
import { publicationUrl, qualificationLabel } from '../qualification';
import { Icon } from './Icon';

export function EventDetailPanel({ event, onClose, onCountry }: { event: CyberEvent; onClose: () => void; onCountry: (country: string) => void }) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => { panel.current?.focus(); }, [event.id]);
  return <aside className="ex-detail" ref={panel} tabIndex={-1} aria-label="Détail de la publication" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
    <div className="ex-detail-top"><span className="ex-eyebrow">La publication en détail</span><button className="ex-icon-button" onClick={onClose} aria-label="Fermer le détail"><Icon name="close" /></button></div>
    <div className="ex-detail-body">
      <span className={`cw-badge cw-badge--${event.severity}`}>{SEVERITY_LABELS[event.severity] ?? event.severity}</span>
      <h2>{event.title}</h2>
      <div className="ex-detail-meta">{sourceFromTags(event.tags).label} · {CATEGORY_LABELS[event.category] ?? event.category}</div>
      <p className="ex-qualification"><Icon name="check" size={13} />{qualificationLabel(event)}</p>
      <p className="ex-detail-description">{event.description || event.summary}</p>
      <dl className="ex-facts"><div><dt>Publié le</dt><dd>{new Date(event.publishedAt ?? event.createdAt).toLocaleString('fr-FR')}{!event.publishedAt && ' (date de collecte)'}</dd></div>
        <div><dt>Confiance</dt><dd>{SEVERITY_LABELS[event.confidence] ?? event.confidence}</dd></div></dl>
      <h3>Pays cités</h3>
      {event.countries.length ? <div className="ex-tags">{event.countries.map((country) => <button key={country} onClick={() => onCountry(country)}>{country}<Icon name="arrowRight" size={12} /></button>)}</div>
        : <p className="ex-muted">Aucun pays documenté dans les données collectées.</p>}
      <p className="ex-note">Une mention géographique ne confirme ni le lieu de l’incident, ni son attribution.</p>
      {event.cves.length > 0 && <><h3>Vulnérabilités associées</h3><div className="ex-tags">{event.cves.map((cve) => <a key={cve} href={`https://nvd.nist.gov/vuln/detail/${encodeURIComponent(cve)}`} target="_blank" rel="noopener noreferrer">{cve}<Icon name="link" size={12} /></a>)}</div></>}
      {event.sectors.length > 0 && <><h3>Secteurs</h3><p>{event.sectors.join(', ')}</p></>}
      {event.organizations.length > 0 && <><h3>Organisations citées</h3><p>{event.organizations.join(', ')}</p></>}
      <h3>Vérifier les sources</h3>
      <div className="ex-publications">{(event.publications ?? []).map((publication, i) => {
        const href = publicationUrl(publication.url);
        return href ? <a key={`${href}-${i}`} href={href} target="_blank" rel="noopener noreferrer"><span>{publication.title}<small>{sourceFromTags([publication.source]).label} · nouvel onglet</small></span><Icon name="link" size={15} /></a> : null;
      })}</div>
      {!event.publications?.length && <p className="ex-muted">Lien source indisponible.</p>}
    </div>
  </aside>;
}
