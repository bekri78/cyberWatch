/**
 * Reprend exactement la forme renvoyee par GET /api/v1/events sur le vrai
 * backend Railway (cf. src/database/repositories/cyberEvents.ts,
 * toApiEvent()). Ne pas ajouter de champ qui n'existe pas reellement cote
 * API -- cette page n'affiche que de la vraie donnee.
 */
export interface CyberEvent {
  id: string;
  title: string;
  summary: string;
  description: string | null;
  category: string;
  severity: string;
  confidence: string;
  publishedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
  countries: string[];
  organizations: string[];
  sectors: string[];
  cves: string[];
  threatActors: string[];
  mitreTechniques: string[];
  tags: string[];
  aiGenerated: boolean;
}

export interface EventsPage {
  items: CyberEvent[];
  nextCursor: string | null;
}

/**
 * Reprend la forme renvoyee par GET /api/v1/situation-report (Phase 6,
 * cf. src/database/repositories/situationReports.ts cote backend) --
 * compte rendu redige par DeepSeek a partir des evenements reels deja
 * filtres (is_relevant=true).
 */
export interface SituationReport {
  id: string;
  summary: string;
  keyPoints: string[];
  eventCount: number;
  windowStart: string;
  windowEnd: string;
  model: string;
  generatedAt: string;
}
