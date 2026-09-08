import { useEffect, useRef } from 'react';
import type { CyberEvent } from '../api/types';
import { CATEGORY_LABELS, SEVERITY_LABELS, sourceFromTags } from '../domain';
import { publicationUrl, qualificationLabel } from '../qualification';
import { Icon } from './Icon';

export function EventDetailPanel({ event, onClose }: { event: CyberEvent; onClose: () => void }) {
  const panel = useRef<HTMLElement>(null);
  const sources = (event.publications ?? []).flatMap((publication) => {
    const href = publicationUrl(publication.url);
    return href ? [{ ...publication, href }] : [];
  });
  const primary = sources[0];
  useEffect(() => { panel.current?.focus(); }, [event.id]);
  return <aside className="ex-detail" ref={panel} tabIndex={-1} aria-label="Détail de la publication" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
    <div className="ex-detail-top"><span className="ex-eyebrow">La publication en détail</span><button className="ex-icon-button" onClick={onClose} aria-label="Fermer le détail"><Icon name="close" /></button></div>
    <div className="ex-detail-body">
      <span className={`cw-badge cw-badge--${event.severity}`}>{SEVERITY_LABELS[event.severity] ?? event.severity}</span>
      <h2>{primary ? <a className="ex-title-link" href={primary.href} target="_blank" rel="noopener noreferrer" title="Ouvrir la publication d’origine dans un nouvel onglet">{event.title}<Icon name="link" size={18} /><span className="sr-only"> (nouvel onglet)</span></a> : event.title}</h2>
      <div className="ex-detail-meta">{sourceFromTags(event.tags).label} · {CATEGORY_LABELS[event.category] ?? event.category}</div>
      <p className="ex-qualification"><Icon name="check" size={13} />{qualificationLabel(event)}</p>
      <p className="ex-detail-description">{event.description || event.summary}</p>
      <dl className="ex-facts"><div><dt>Publié le</dt><dd>{new Date(event.publishedAt ?? event.createdAt).toLocaleString('fr-FR')}{!event.publishedAt && ' (date de collecte)'}</dd></div>
      </dl>
      {event.cves.length > 0 && <><h3>Vulnérabilités associées</h3><div className="ex-tags">{event.cves.map((cve) => <a key={cve} href={`https://nvd.nist.gov/vuln/detail/${encodeURIComponent(cve)}`} target="_blank" rel="noopener noreferrer">{cve}<Icon name="link" size={12} /></a>)}</div></>}
      {event.sectors.length > 0 && <><h3>Secteurs</h3><p>{event.sectors.join(', ')}</p></>}
      {event.organizations.length > 0 && <><h3>Organisations citées</h3><p>{event.organizations.join(', ')}</p></>}
      {sources.length > 1 && <div className="ex-extra-sources">{sources.slice(1).map((source, i) => <a key={`${source.href}-${i}`} href={source.href} target="_blank" rel="noopener noreferrer">{source.title}<Icon name="link" size={12} /><span className="sr-only"> (nouvel onglet)</span></a>)}</div>}
    </div>
  </aside>;
}
