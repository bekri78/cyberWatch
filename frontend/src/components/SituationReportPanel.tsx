import type { SituationReport } from '../api/types';
import { relativeTime } from '../domain';
import { Icon } from './Icon';
import { LoadingState } from './RequestState';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Compte rendu de situation redige par DeepSeek (Phase 6, cf.
 * useSituationReport). report=null n'est pas une erreur : soit
 * DEEPSEEK_API_KEY n'est pas configuree cote serveur, soit aucun passage
 * planifie n'a encore eu lieu (cf. jobs/situationReportScheduler.ts) --
 * dans les deux cas, un placeholder honnete plutot qu'un texte invente.
 */
export function SituationReportPanel({ loading, report }: { loading: boolean; report: SituationReport | null }) {
  if (loading) {
    return (
      <div className="cw-panel" style={{ borderColor: 'rgba(113,112,255,0.3)' }}>
        <LoadingState label="Chargement du compte rendu…" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="cw-panel" style={{ borderColor: 'rgba(113,112,255,0.3)' }}>
        <div className="cw-empty" style={{ border: 'none', background: 'none', padding: '24px 12px' }}>
          <Icon name="brain" size={22} color="var(--accent)" />
          <div className="cw-empty-title">Compte rendu automatique : en attente</div>
          <p className="cw-empty-desc">
            Aucun compte rendu n'a encore ete genere par DeepSeek (premier passage planifie a venir, ou generation
            desactivee cote serveur). Cette page n'affiche que des donnees reellement collectees.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="cw-panel" style={{ borderColor: 'rgba(113,112,255,0.3)', padding: 20 }}>
      <div className="flex items-start justify-between gap-3">
        <div className="cw-section-eyebrow">
          <Icon name="brain" size={13} color="var(--accent)" />
          Compte rendu de situation
        </div>
        <span
          className="shrink-0 text-[11px] text-quaternary"
          title={`Genere le ${formatDateTime(report.generatedAt)}`}
        >
          {relativeTime(report.generatedAt)}
        </span>
      </div>

      <p className="mt-2.5 text-[13.5px] leading-relaxed text-secondary">{report.summary}</p>

      {report.keyPoints.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {report.keyPoints.map((point, i) => (
            <li key={i} className="flex items-start gap-2 text-[12.5px] leading-snug text-secondary">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent" />
              {point}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 border-t border-border-subtle pt-3 text-[11px] text-quaternary">
        Base sur {report.eventCount} evenement{report.eventCount > 1 ? 's' : ''} reel
        {report.eventCount > 1 ? 's' : ''}, entre le {formatDate(report.windowStart)} et le{' '}
        {formatDate(report.windowEnd)} · Redige par {report.model}
      </div>
    </div>
  );
}
