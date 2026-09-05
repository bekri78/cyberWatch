import type { CollectorItem } from '../types';

/**
 * Forme reelle d'une entree du catalogue CISA KEV (verifiee sur le vrai
 * flux le 2026-09-04 -- cf. tests/collectors/cisa-kev-fixtures). CISA
 * ajoute parfois des champs (ex: forensicTriage) : on ne type que ce dont
 * on se sert, le reste est conserve tel quel dans `raw`.
 */
export interface CisaKevVulnerability {
  cveID: string;
  vendorProject: string;
  product: string;
  vulnerabilityName: string;
  dateAdded: string;
  shortDescription: string;
  knownRansomwareCampaignUse?: string;
  cwes?: string[];
}

export interface CisaKevCatalog {
  title: string;
  catalogVersion: string;
  dateReleased: string;
  count: number;
  vulnerabilities: CisaKevVulnerability[];
}

/**
 * Convertit une entree brute du catalogue CISA KEV vers le format
 * CollectorItem commun. Fonction pure, testable sans reseau.
 *
 * Contrairement a CERT-FR (URL de l'article), CISA ne fournit pas de page
 * dediee par CVE dans le JSON -- on utilise la fiche NVD correspondante
 * (deterministe, reelle, et deja referencee par CISA elle-meme dans son
 * champ "notes"). Le titre integre le cveID brut pour garantir que
 * l'extraction de CVE (regex, cf. classifyEvent) le retrouve a coup sur,
 * meme si vulnerabilityName ne le repete pas.
 */
export function normalizeVulnerability(vuln: CisaKevVulnerability): CollectorItem {
  return {
    externalId: vuln.cveID,
    url: `https://nvd.nist.gov/vuln/detail/${vuln.cveID}`,
    title: `${vuln.cveID} - ${vuln.vulnerabilityName}`,
    publishedAt: vuln.dateAdded ? new Date(vuln.dateAdded) : null,
    contentExcerpt: (vuln.shortDescription ?? '').trim().slice(0, 2000),
    raw: vuln,
  };
}
