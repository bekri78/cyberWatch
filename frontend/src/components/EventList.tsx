import type { CyberEvent } from '../api/types';
import { CATEGORY_LABELS, relativeTime, severityClass, sourceFromTags, SEVERITY_LABELS } from '../domain';
import { Icon } from './Icon';

function EventRow({ event }: { event: CyberEvent }) {
  const source = sourceFromTags(event.tags);

  return (
    <div className="cw-event-row" title={event.summary}>
      <span
        className="cw-event-stripe"
        style={{ background: `var(--crit-${event.severity in SEVERITY_LABELS ? event.severity : 'low'})` }}
      />
      <div style={{ minWidth: 0 }}>
        <div className="cw-event-title">{event.title}</div>
        <div className="cw-event-meta">
          <span style={{ color: source.color }}>{source.label}</span>
          <span>·</span>
          <span>{CATEGORY_LABELS[event.category] ?? event.category}</span>
          <span>·</span>
          <span>{relativeTime(event.publishedAt ?? event.createdAt)}</span>
          {event.countries.length > 0 && (
            <>
              <span>·</span>
              <span>{event.countries.slice(0, 3).join(', ')}</span>
            </>
          )}
        </div>
      </div>
      <span className="cw-event-side">
        <span className={`cw-badge ${severityClass(event.severity)}`}>
          <span className="cw-badge-dot" />
          {SEVERITY_LABELS[event.severity] ?? event.severity}
        </span>
        <Icon name="arrowRight" size={14} color="var(--text-quaternary)" />
      </span>
    </div>
  );
}

export function EventList({ events, limit = 8 }: { events: CyberEvent[]; limit?: number }) {
  const visible = events.slice(0, limit);

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
    <div className="cw-panel" style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {visible.map((event) => (
        <EventRow key={event.id} event={event} />
      ))}
    </div>
  );
}
