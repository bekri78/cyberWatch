import type { CyberEvent } from './api/types';

export function qualificationLabel(event: Pick<CyberEvent, 'qualificationStatus' | 'aiGenerated'>): string {
  switch (event.qualificationStatus) {
    case 'pending': return 'À qualifier';
    case 'failed': return 'Relecture en échec';
    case 'rejected': return 'Écarté';
    case 'qualified': return event.aiGenerated ? 'Pertinence évaluée par IA' : 'Source institutionnelle';
    default: return 'Qualification non renseignée';
  }
}

export function publicationUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
  } catch { return null; }
}
