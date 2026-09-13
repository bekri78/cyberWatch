import { useState } from 'react';
import type { CyberEvent } from '../api/types';
import { CATEGORY_LABELS, relativeTime, severityClass, sourceFromTags, SEVERITY_LABELS } from '../domain';
import { publicationUrl, qualificationLabel } from '../qualification';
import { EventDetailModal } from './EventDetailModal';
import { Icon } from './Icon';

/**
 * Seule CERT-FR fournit assez de contenu structure (description, CVE,
 * secteurs...) pour justifier la modale de detail. Les autres sources
 * (GDELT, Google Actualites FR, Microsoft MSRC, CISA KEV, BleepingComputer,
 * The Hacker News) n'ont rien de plus a montrer que la ligne elle-meme --
 * on redirige alors directement vers la publication source.
 */
const SOURCES_WITH_DETAIL = new Set(['certfr']);

function EventRow({ event, onSelect }: { event: CyberEvent; onSelect: (event: CyberEvent) => void }) {
  const source = sourceFromTags(event.tags);
  const hasDetail = SOURCES_WITH_DETAIL.has(event.tags[0]);
  const externalUrl = hasDetail ? null : publicationUrl(event.publications?.[0]?.url ?? '');
  const provisional = event.qualificationStatus === 'pending' || event.qualificationStatus === 'failed';

  function activate() {
    if (externalUrl) {
      window.open(externalUrl, '_blank', 'noopener,noreferrer');
    } else {
      onSelect(event);
    }
  }

  return (
    <div
      className="cw-event-row"
      title={event.summary}
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div className="cw-event-title">{event.title}</div>
        <div className="cw-event-meta">
          <span style={{ color: source.color }}>{source.label}</span>
          <span>· {qualificationLabel(event)}</span>
          <span>·</span>
          <span>{provisional ? 'Catégorie provisoire' : (CATEGORY_LABELS[event.category] ?? event.category)}</span>
          <span>·</span>
          <span>{relativeTime(event.publishedAt ?? event.createdAt)}</span>
          {event.countries.length > 0 && (
            <>
              <span>·</span>
              <span>{event.countries.join(', ')}</span>
            </>
          )}
        </div>
      </div>
      <span className="cw-event-side">
        <span className={`cw-badge ${severityClass(event.severity)}`}>
          <span className="cw-badge-dot" />
          {SEVERITY_LABELS[event.severity] ?? event.severity}
        </span>
        <Icon name={externalUrl ? 'link' : 'arrowRight'} size={14} color="var(--text-quaternary)" />
      </span>
    </div>
  );
}

export function EventList({ events, limit = 8, onSelect }: { events: CyberEvent[]; limit?: number; onSelect?: (event: CyberEvent) => void }) {
  const visible = events.slice(0, limit);
  const [selected, setSelected] = useState<CyberEvent | null>(null);

  if (visible.length === 0) {
    return (
      <div className="cw-empty">
        <Icon name="check" size={22} color="var(--text-quaternary)" />
        <div className="cw-empty-title">Aucun evenement</div>
        <p className="cw-empty-desc">Aucun evenement disponible pour le moment.</p>
      </div>
    );
  }

  return (
    <>
      <div className="cw-panel" style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {visible.map((event) => (
          <EventRow key={event.id} event={event} onSelect={onSelect ?? setSelected} />
        ))}
      </div>
      {selected && <EventDetailModal event={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
