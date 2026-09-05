import type {
  ARetenirItem,
  MenaceCampagneItem,
  SecteurItem,
  SituationReport,
  VulnerabiliteItem,
} from '../api/types';
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

/** Reutilise exactement les classes .cw-badge--{low|medium|high|critical} deja definies pour la severite des evenements (meme systeme visuel, cf. EventList.tsx). */
function criticiteBadgeClass(criticite: string): string {
  switch (criticite) {
    case 'CRITIQUE':
      return 'cw-badge--critical';
    case 'ELEVEE':
      return 'cw-badge--high';
    case 'MODEREE':
      return 'cw-badge--medium';
    default:
      return 'cw-badge--low';
  }
}

function CriticiteBadge({ criticite }: { criticite: string }) {
  return (
    <span className={`cw-badge ${criticiteBadgeClass(criticite)}`}>
      <span className="cw-badge-dot" />
      {criticite}
    </span>
  );
}

/** Pastille compacte (exploitation / KEV) -- distincte de CriticiteBadge : etat binaire/tri-etat, pas une echelle de gravite. */
function StatusPill({ label, tone }: { label: string; tone: 'danger' | 'warning' | 'muted' }) {
  const styles: Record<typeof tone, { bg: string; color: string; border: string }> = {
    danger: { bg: 'rgba(229,72,77,0.14)', color: 'var(--crit-critical)', border: 'rgba(229,72,77,0.35)' },
    warning: { bg: 'rgba(247,107,21,0.14)', color: 'var(--crit-high)', border: 'rgba(247,107,21,0.35)' },
    muted: { bg: 'var(--s2)', color: 'var(--text-quaternary)', border: 'var(--border-standard)' },
  };
  const s = styles[tone];
  return (
    <span
      className="rounded-full border px-2 py-0.5 text-[10.5px] font-semibold tracking-[0.02em] uppercase"
      style={{ background: s.bg, color: s.color, borderColor: s.border }}
    >
      {label}
    </span>
  );
}

function exploitationTone(exploitation: VulnerabiliteItem['exploitation']): 'danger' | 'warning' | 'muted' {
  if (exploitation === 'Oui') return 'danger';
  if (exploitation === 'Suspectee') return 'warning';
  return 'muted';
}

function SectionHeader({ icon, label, count }: { icon: Parameters<typeof Icon>[0]['name']; label: string; count?: number }) {
  return (
    <div className="flex items-center gap-1.5 text-[11.5px] font-semibold tracking-[0.04em] text-tertiary uppercase">
      <Icon name={icon} size={13} color="var(--accent)" />
      {label}
      {count !== undefined && <span className="text-quaternary normal-case">· {count}</span>}
    </div>
  );
}

function ARetenirCard({ item }: { item: ARetenirItem }) {
  return (
    <div className="rounded-[10px] border border-border-standard bg-[var(--s1)] p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-primary">{item.titre}</span>
        <CriticiteBadge criticite={item.criticite} />
      </div>
      {item.concerne && <div className="mt-1 text-[11.5px] text-tertiary">Concerne : {item.concerne}</div>}
      <p className="mt-2 text-[12.5px] leading-relaxed text-secondary">{item.situation}</p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-secondary">
        <span className="font-medium text-tertiary">Évaluation — </span>
        {item.evaluation}
      </p>
      {item.sources.length > 0 && (
        <div className="mt-2 text-[10.5px] text-quaternary">Source(s) : {item.sources.join(', ')}</div>
      )}
    </div>
  );
}

function VulnerabiliteRow({ item }: { item: VulnerabiliteItem }) {
  return (
    <div className="rounded-[10px] border border-border-standard bg-[var(--s1)] p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {item.cve ? (
            <a
              href={`https://nvd.nist.gov/vuln/detail/${item.cve}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-[rgba(247,107,21,0.35)] bg-[rgba(247,107,21,0.12)] px-2 py-0.5 font-mono text-[11px] text-warning hover:bg-[rgba(247,107,21,0.2)]"
            >
              {item.cve}
              <Icon name="link" size={9} />
            </a>
          ) : null}
          <span className="text-[13px] font-semibold text-primary">{item.produit}</span>
        </div>
        <CriticiteBadge criticite={item.criticite} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <StatusPill label={`Exploitation : ${item.exploitation}`} tone={exploitationTone(item.exploitation)} />
        <StatusPill label={`KEV : ${item.kev}`} tone={item.kev === 'Oui' ? 'warning' : 'muted'} />
        {item.epss && <StatusPill label={`EPSS : ${item.epss}`} tone="muted" />}
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-secondary">{item.resume}</p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-secondary">
        <span className="font-medium text-tertiary">Impact potentiel — </span>
        {item.impact}
      </p>
    </div>
  );
}

function MenaceCampagneRow({ item }: { item: MenaceCampagneItem }) {
  return (
    <div className="rounded-[10px] border border-border-standard bg-[var(--s1)] p-3.5">
      <div className="text-[13px] font-semibold text-primary">{item.titre}</div>
      {(item.objectif || item.secteurs) && (
        <div className="mt-1 text-[11.5px] text-tertiary">
          {item.objectif && <>Objectif : {item.objectif}</>}
          {item.objectif && item.secteurs && ' · '}
          {item.secteurs && <>Secteurs : {item.secteurs}</>}
        </div>
      )}
      <p className="mt-2 text-[12.5px] leading-relaxed text-secondary">{item.details}</p>
    </div>
  );
}

function SecteurRow({ item }: { item: SecteurItem }) {
  return (
    <div className="rounded-[10px] border border-border-standard bg-[var(--s1)] p-3.5">
      <div className="text-[13px] font-semibold text-primary">{item.titre}</div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-secondary">{item.details}</p>
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((text, i) => (
        <li key={i} className="flex items-start gap-2 text-[12.5px] leading-snug text-secondary">
          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent" />
          {text}
        </li>
      ))}
    </ul>
  );
}

/**
 * Compte rendu de situation "analyste" redige par DeepSeek (Phase 6.1, cf.
 * useSituationReport). report=null n'est pas une erreur : soit
 * DEEPSEEK_API_KEY n'est pas configuree cote serveur, soit aucun passage
 * planifie n'a encore eu lieu -- placeholder honnete dans ce cas plutot
 * qu'un texte invente. Chaque section n'est rendue que si elle contient
 * reellement quelque chose -- une section vide signifie que rien n'y
 * meritait d'etre signale pour cette periode (regle de non-evenement).
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

  const { sections } = report;

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

      {sections.aRetenir.length > 0 && (
        <div className="mt-4 flex flex-col gap-2.5">
          <SectionHeader icon="alert" label="À retenir" count={sections.aRetenir.length} />
          {sections.aRetenir.map((item, i) => (
            <ARetenirCard key={i} item={item} />
          ))}
        </div>
      )}

      {sections.vulnerabilitesImportantes.length > 0 && (
        <div className="mt-4 flex flex-col gap-2.5">
          <SectionHeader icon="bug" label="Vulnérabilités importantes" count={sections.vulnerabilitesImportantes.length} />
          {sections.vulnerabilitesImportantes.map((item, i) => (
            <VulnerabiliteRow key={i} item={item} />
          ))}
        </div>
      )}

      {sections.menacesCampagnes.length > 0 && (
        <div className="mt-4 flex flex-col gap-2.5">
          <SectionHeader icon="zap" label="Menaces et campagnes" count={sections.menacesCampagnes.length} />
          {sections.menacesCampagnes.map((item, i) => (
            <MenaceCampagneRow key={i} item={item} />
          ))}
        </div>
      )}

      {sections.otIcs.length > 0 && (
        <div className="mt-4 flex flex-col gap-2.5">
          <SectionHeader icon="factory" label="OT / ICS / infrastructures critiques" count={sections.otIcs.length} />
          {sections.otIcs.map((item, i) => (
            <SecteurRow key={i} item={item} />
          ))}
        </div>
      )}

      {sections.defenseSpatial.length > 0 && (
        <div className="mt-4 flex flex-col gap-2.5">
          <SectionHeader icon="satellite" label="Défense / spatial / souveraineté" count={sections.defenseSpatial.length} />
          {sections.defenseSpatial.map((item, i) => (
            <SecteurRow key={i} item={item} />
          ))}
        </div>
      )}

      {sections.tendances.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          <SectionHeader icon="activity" label="Tendances" />
          <BulletList items={sections.tendances} />
        </div>
      )}

      {sections.pointsASurveiller.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          <SectionHeader icon="eye" label="Points à surveiller" />
          <BulletList items={sections.pointsASurveiller} />
        </div>
      )}

      <div className="mt-4 border-t border-border-subtle pt-3 text-[11px] text-quaternary">
        Base sur {report.eventCount} evenement{report.eventCount > 1 ? 's' : ''} reel
        {report.eventCount > 1 ? 's' : ''}, entre le {formatDate(report.windowStart)} et le{' '}
        {formatDate(report.windowEnd)} · Redige par {report.model}
      </div>
    </div>
  );
}
