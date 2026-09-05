/**
 * Traductions/couleurs pour les vraies valeurs renvoyees par l'API (cf.
 * src/pipeline/classifyEvent.ts et migrations 005/007 cote backend). Rien
 * ici n'invente une categorie ou une source qui n'existe pas reellement.
 */

export const SEVERITY_LABELS: Record<string, string> = {
  low: 'Faible',
  medium: 'Modere',
  high: 'Eleve',
  critical: 'Critique',
};

export const SEVERITY_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export function severityClass(severity: string): string {
  return SEVERITY_LABELS[severity] ? `cw-badge--${severity}` : 'cw-badge--low';
}

/** Memes teintes que les jetons --crit-* de index.css (les marqueurs Leaflet ont besoin d'une couleur litterale, pas d'un var()). */
export const SEVERITY_COLORS: Record<string, string> = {
  low: '#7a7fad',
  medium: '#5e6ad2',
  high: '#f76b15',
  critical: '#e5484d',
};

export const CATEGORY_LABELS: Record<string, string> = {
  vulnerability: 'Vulnerabilite',
  alert: 'Alerte',
  threat_intel: 'Renseignement',
  attack: 'Attaque',
  other: 'Autre',
};

export const CATEGORY_ICONS: Record<string, string> = {
  vulnerability: 'bug',
  alert: 'alert',
  threat_intel: 'satellite',
  attack: 'zap',
  other: 'file',
};

/** name -> {label, color} pour les 6 sources reellement seedees en base. */
export const SOURCE_META: Record<string, { label: string; color: string }> = {
  certfr: { label: 'CERT-FR', color: '#5e6ad2' },
  cisa_kev: { label: 'CISA KEV', color: '#7a7fad' },
  microsoft_msrc: { label: 'Microsoft MSRC', color: '#00a4ef' },
  bleepingcomputer: { label: 'BleepingComputer', color: '#f76b15' },
  hackernews: { label: 'The Hacker News', color: '#27a644' },
  gdelt: { label: 'GDELT', color: '#8a8f98' },
};

/** Le 1er tag est toujours le nom de la source (cf. classifyEvent.buildTags). */
export function sourceFromTags(tags: string[]): { label: string; color: string } {
  const name = tags[0];
  return (name && SOURCE_META[name]) || { label: name ?? 'Source inconnue', color: '#62666d' };
}

export function relativeTime(iso: string | null): string {
  if (!iso) return 'date inconnue';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "a l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hh = Math.round(mins / 60);
  if (hh < 24) return `il y a ${hh} h`;
  const j = Math.round(hh / 24);
  return `il y a ${j} j`;
}
