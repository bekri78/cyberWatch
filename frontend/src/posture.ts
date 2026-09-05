import type { CyberEvent } from './api/types';

export interface Posture {
  key: 'normal' | 'surveillance' | 'renforce' | 'eleve' | 'critique';
  label: string;
  color: string;
  caption: string;
}

export interface Indicator {
  label: string;
  value: number;
  alert?: boolean;
}

/**
 * Posture deduite deterministiquement des severites reelles de
 * l'echantillon charge (cf. useRecentEvents) -- aucune generation IA de
 * texte ici (Phase 5 ne fait que filtrer la pertinence gdelt, elle ne
 * redige rien). Regle simple et transparente, dans le meme esprit que le
 * classifyEvent deterministe du backend : un evenement critique suffit a
 * declencher l'alerte la plus haute, plutot que d'attendre un seuil.
 */
export function derivePosture(events: CyberEvent[], sampleSize: number): Posture {
  const critical = events.filter((e) => e.severity === 'critical').length;
  const high = events.filter((e) => e.severity === 'high').length;
  const medium = events.filter((e) => e.severity === 'medium').length;

  const base = `Sur les ${sampleSize} derniers evenements collectes`;

  if (critical > 0) {
    return {
      key: 'critique',
      label: 'Critique',
      color: 'var(--error)',
      caption: `${base}, ${critical} evenement${critical > 1 ? 's' : ''} de severite critique.`,
    };
  }
  if (high >= 5) {
    return {
      key: 'eleve',
      label: 'Eleve',
      color: 'var(--warning)',
      caption: `${base}, ${high} evenements de severite elevee.`,
    };
  }
  if (high >= 1) {
    return {
      key: 'renforce',
      label: 'Renforce',
      color: 'var(--brand)',
      caption: `${base}, ${high} evenement${high > 1 ? 's' : ''} de severite elevee a surveiller.`,
    };
  }
  if (medium >= 10) {
    return {
      key: 'surveillance',
      label: 'Surveillance',
      color: 'var(--security)',
      caption: `${base}, ${medium} evenements de severite moderee.`,
    };
  }
  return {
    key: 'normal',
    label: 'Normal',
    color: 'var(--success)',
    caption: `${base}, aucune severite elevee ou critique.`,
  };
}

export function buildIndicators(events: CyberEvent[]): Indicator[] {
  const critical = events.filter((e) => e.severity === 'critical').length;
  const high = events.filter((e) => e.severity === 'high').length;
  const distinctCountries = new Set(events.flatMap((e) => e.countries)).size;
  const distinctSources = new Set(events.flatMap((e) => e.tags[0] ?? [])).size;

  return [
    { label: 'Evenements', value: events.length },
    { label: 'Critiques', value: critical, alert: critical > 0 },
    { label: 'Eleves', value: high, alert: high > 0 },
    { label: 'Pays cites', value: distinctCountries },
    { label: 'Sources actives', value: distinctSources },
  ];
}

/** Agrege les vrais pays cites (champ countries[], gdelt uniquement pour l'instant) pour la carte. */
export function countEventsByCountry(events: CyberEvent[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) {
    for (const country of event.countries) {
      counts.set(country, (counts.get(country) ?? 0) + 1);
    }
  }
  return counts;
}
