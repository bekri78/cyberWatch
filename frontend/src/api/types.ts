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

export interface ARetenirItem {
  titre: string;
  criticite: 'CRITIQUE' | 'ELEVEE' | 'MODEREE';
  concerne: string;
  situation: string;
  evaluation: string;
  sources: string[];
}

export interface VulnerabiliteItem {
  cve: string | null;
  produit: string;
  criticite: string;
  exploitation: 'Oui' | 'Non connue' | 'Suspectee';
  kev: 'Oui' | 'Non';
  epss: string | null;
  resume: string;
  impact: string;
}

export interface MenaceCampagneItem {
  titre: string;
  objectif: string | null;
  secteurs: string | null;
  details: string;
}

export interface SecteurItem {
  titre: string;
  details: string;
}

export interface SituationReportSections {
  aRetenir: ARetenirItem[];
  vulnerabilitesImportantes: VulnerabiliteItem[];
  menacesCampagnes: MenaceCampagneItem[];
  otIcs: SecteurItem[];
  defenseSpatial: SecteurItem[];
  tendances: string[];
  pointsASurveiller: string[];
}

/**
 * Reprend la forme renvoyee par GET /api/v1/situation-report (Phase 6,
 * cf. src/database/repositories/situationReports.ts cote backend) --
 * compte rendu "analyste" redige par DeepSeek a partir des evenements
 * reels deja filtres (is_relevant=true) : synthese executive courte +
 * sections hierarchisees par criticite (aucune section n'est garantie
 * non-vide -- une section vide signifie que rien n'y meritait d'etre
 * signale pour cette periode, ce n'est pas une erreur).
 */
export interface SituationReport {
  id: string;
  summary: string;
  sections: SituationReportSections;
  eventCount: number;
  windowStart: string;
  windowEnd: string;
  model: string;
  generatedAt: string;
}
