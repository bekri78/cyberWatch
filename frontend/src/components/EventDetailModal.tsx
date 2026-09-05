import { useEffect } from 'react';
import type { CyberEvent } from '../api/types';
import { CATEGORY_LABELS, SEVERITY_LABELS, severityClass, sourceFromTags } from '../domain';
import { Icon } from './Icon';

function formatDateTime(iso: string | null): string {
  if (!iso) return 'inconnue';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Chips pour une liste de valeurs reelles (pays, organisations, secteurs...) -- rien n'est affiche si la liste est vide. */
function ChipGroup({ label, icon, values }: { label: string; icon: Parameters<typeof Icon>[0]['name']; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.04em] text-quaternary uppercase">
        <Icon name={icon} size={12} />
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => (
          <span
            key={value}
            className="rounded-full border border-border-standard bg-[var(--s2)] px-2.5 py-1 text-[12px] text-secondary"
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * CVE reellement identifiants publics (format CVE-YYYY-NNNNN) -- le lien
 * NVD est construit directement a partir de l'identifiant, rien n'est
 * invente. Les techniques MITRE ne sont pas linkifiees (le format des
 * sous-techniques, ex: T1566.001, ne se traduit pas de facon fiable en URL
 * attack.mitre.org sans verification au cas par cas).
 */
function CveGroup({ cves }: { cves: string[] }) {
  if (cves.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.04em] text-quaternary uppercase">
        <Icon name="hash" size={12} />
        CVE associees
      </div>
      <div className="flex flex-wrap gap-1.5">
        {cves.map((cve) => (
          <a
            key={cve}
            href={`https://nvd.nist.gov/vuln/detail/${cve}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-[rgba(247,107,21,0.35)] bg-[rgba(247,107,21,0.12)] px-2.5 py-1 font-mono text-[11.5px] text-warning hover:bg-[rgba(247,107,21,0.2)]"
          >
            {cve}
            <Icon name="link" size={10} />
          </a>
        ))}
      </div>
    </div>
  );
}

export function EventDetailModal({ event, onClose }: { event: CyberEvent; onClose: () => void }) {
  const source = sourceFromTags(event.tags);
  const showAiStatus = event.tags[0] === 'gdelt';

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-10 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-border-standard bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={event.title}
      >
        <div className="flex items-start gap-3 border-b border-border-subtle p-5">
          <span
            className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: `var(--crit-${event.severity in SEVERITY_LABELS ? event.severity : 'low'})` }}
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] leading-snug font-semibold text-primary">{event.title}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-tertiary">
              <span className={`cw-badge ${severityClass(event.severity)}`}>
                <span className="cw-badge-dot" />
                {SEVERITY_LABELS[event.severity] ?? event.severity}
              </span>
              <span style={{ color: source.color }}>{source.label}</span>
              <span>·</span>
              <span>{CATEGORY_LABELS[event.category] ?? event.category}</span>
              <span>·</span>
              <span>Confiance {event.confidence}</span>
              {showAiStatus && (
                <>
                  <span>·</span>
                  <span
                    className={`inline-flex items-center gap-1 ${event.aiGenerated ? 'text-accent' : 'text-quaternary'}`}
                  >
                    <Icon name={event.aiGenerated ? 'brain' : 'clock'} size={12} />
                    {event.aiGenerated ? 'Verifie par IA' : 'Revue IA en attente'}
                  </span>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0 rounded-lg p-1.5 text-quaternary transition-colors hover:bg-[var(--s2)] hover:text-secondary"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-5">
          {(event.description ?? event.summary) && (
            <p className="text-[13.5px] leading-relaxed text-secondary">{event.description ?? event.summary}</p>
          )}

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11.5px] text-quaternary">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="calendar" size={12} />
              Publie : {formatDateTime(event.publishedAt)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="clock" size={12} />
              Premiere collecte : {formatDateTime(event.firstSeenAt)}
            </span>
            {event.lastSeenAt !== event.firstSeenAt && (
              <span className="inline-flex items-center gap-1.5">
                <Icon name="refresh" size={12} />
                Derniere mise a jour : {formatDateTime(event.lastSeenAt)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 border-t border-border-subtle pt-4 sm:grid-cols-2">
            <ChipGroup label="Pays cites" icon="mapPin" values={event.countries} />
            <ChipGroup label="Organisations" icon="building" values={event.organizations} />
            <ChipGroup label="Secteurs" icon="satellite" values={event.sectors} />
            <ChipGroup label="Acteurs de la menace" icon="target" values={event.threatActors} />
          </div>

          <CveGroup cves={event.cves} />
          <ChipGroup label="Techniques MITRE ATT&CK" icon="sliders" values={event.mitreTechniques} />
        </div>
      </div>
    </div>
  );
}
