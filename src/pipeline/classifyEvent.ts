import { detectOtVendor } from '../lib/text/detectOtVendor';
import { extractCves } from '../lib/text/extractCves';
import { extractCvssScore } from '../lib/text/extractCvssScore';

export interface ClassificationInput {
  sourceName: string;
  url: string;
  title: string;
  contentExcerpt: string | null;
}

export interface Classification {
  category: string;
  severity: string;
  confidence: string;
  cves: string[];
  tags: string[];
  countries: string[];
}

// "Pays: X, Y" est ecrit tel quel par gdelt/normalize.ts (buildContentExcerpt)
// a partir du vrai champ V1LOCATIONS -- raw_items ne conserve pas
// CollectorItem.raw (pas de colonne dediee, cf. §46), donc contentExcerpt est
// le seul endroit ou cette information survit jusqu'ici. Restreint a gdelt :
// aucune autre source n'ecrit ce segment.
const GDELT_COUNTRIES_PATTERN = /Pays: ([^—]+)/;

function extractGdeltCountries(contentExcerpt: string | null): string[] {
  if (!contentExcerpt) return [];
  const match = GDELT_COUNTRIES_PATTERN.exec(contentExcerpt);
  if (!match?.[1]) return [];
  return match[1]
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

// "activement exploitee/exploite/exploitees" -- CERT-FR utilise
// systematiquement cette formule quand une exploitation active est
// constatee. Signal deterministe fort, avant toute analyse IA (Phase 5).
const ACTIVE_EXPLOITATION_PATTERN = /activement exploit/i;

/**
 * Categorie deterministe a partir de la source + de l'URL. Volontairement
 * simple pour l'instant (un seul collecteur actif, cf. Phase 3) : chaque
 * nouvelle source (Phase 6) ajoute son propre mapping ici plutot que de
 * deviner via du texte libre.
 */
function classifyCategory(sourceName: string, url: string): string {
  if (sourceName === 'certfr') {
    if (url.includes('/avis/')) return 'vulnerability';
    if (url.includes('/alerte/')) return 'alert';
    if (url.includes('/cti/')) return 'threat_intel';
  }
  if (sourceName === 'cisa_kev') return 'vulnerability';
  if (sourceName === 'microsoft_msrc') return 'vulnerability';
  // gdelt : incident reel (attaque/compromission rapportee dans la presse
  // mondiale), pas une divulgation de vulnerabilite -- categorie distincte
  // volontairement, cf. §37.
  if (sourceName === 'gdelt') return 'attack';
  // google_news_fr : meme nature que gdelt (incident reel rapporte par la
  // presse, ici francophone, cf. migration 011) -- meme categorie.
  if (sourceName === 'google_news_fr') return 'attack';
  return 'other';
}

// Bandes de severite standard CVSS v3.x (echelle qualitative officielle
// NVD/FIRST.org : 0.1-3.9 low, 4.0-6.9 medium, 7.0-8.9 high, 9.0-10.0
// critical). Utilise uniquement pour microsoft_msrc, qui fournit un score
// numerique fiable -- bien plus precis que la detection de phrase utilisee
// pour CERT-FR.
function classifySeverityFromCvss(score: number): string {
  if (score >= 9.0) return 'critical';
  if (score >= 7.0) return 'high';
  if (score >= 4.0) return 'medium';
  return 'low';
}

/**
 * Severite deterministe basee sur des signaux explicites (cf. cahier des
 * charges §16 : "severite a partir de signaux ... avant toute implication
 * IA"). Ce n'est pas la severite finale du systeme -- Phase 5 (DeepSeek)
 * l'affinera avec un vrai raisonnement, mais un evenement doit toujours
 * avoir une valeur exploitable des sa creation.
 *
 * Cas 'threat_intel' (cti) : ces rapports n'ont generalement ni CVE ni
 * formule "activement exploitee" (vocabulaire specifique aux bulletins de
 * vulnerabilites) -- ils retombent donc sur 'low' par defaut. Distinguer
 * un panorama annuel d'une campagne de compromission en cours demande une
 * vraie lecture du contenu : volontairement laisse a l'IA (Phase 5)
 * plutot que d'ajouter des heuristiques texte fragiles ici.
 */
function classifySeverity(category: string, hasCve: boolean, activeExploitation: boolean): string {
  if (activeExploitation) return 'critical';
  if (category === 'alert') return 'high';
  if (hasCve) return 'medium';
  return 'low';
}

/**
 * Le tag 'ot' est ajoute des qu'un editeur industriel connu est mentionne
 * (cf. detectOtVendor), quelle que soit la source ou le flux d'origine --
 * qu'un avis Siemens arrive via /avis/ ou via /feed/scada/ ne doit pas
 * changer sa detectabilite (cf. document d'architecture, l'un est un
 * sous-ensemble filtre de l'autre, pas un contenu distinct).
 */
function buildTags(sourceName: string, category: string, haystack: string): string[] {
  const tags = [sourceName, category];
  if (detectOtVendor(haystack)) tags.push('ot');
  return [...new Set(tags)];
}

/**
 * Classifie un raw_item en champs deterministes pour cyber_events, sans
 * appel IA. confidence reste 'low' tant que DeepSeek n'a pas relu
 * l'evenement (Phase 5) -- ai_generated=false le signale explicitement
 * cote base et cote API.
 */
export function classifyEvent(input: ClassificationInput): Classification {
  const haystack = `${input.title}\n${input.contentExcerpt ?? ''}`;
  const cves = extractCves(haystack);
  const category = classifyCategory(input.sourceName, input.url);

  // CISA KEV : l'appartenance au catalogue EST la definition d'une
  // exploitation active confirmee (Known Exploited Vulnerabilities) --
  // contrairement a CERT-FR, il n'y a pas de formule textuelle fiable a
  // chercher dans la prose anglaise de CISA, donc on force 'critical'
  // directement plutot que de deviner via un pattern regex fragile.
  if (input.sourceName === 'cisa_kev') {
    return {
      category,
      severity: 'critical',
      confidence: 'low',
      cves,
      tags: buildTags(input.sourceName, category, haystack),
      countries: [],
    };
  }

  // Microsoft MSRC : score CVSS numerique fiable, ecrit deliberement dans
  // contentExcerpt par le normalizer ("CVSS X.X — ..."). On en derive la
  // severite par bande CVSS standard plutot que par detection de phrase
  // (la prose anglaise de MSRC ne contient jamais "activement exploitee").
  // Volontairement restreint a cette source : CERT-FR mentionne parfois
  // aussi "CVSS" dans son propre texte (verifie sur les vraies fixtures),
  // et son comportement deja teste ne doit pas changer.
  if (input.sourceName === 'microsoft_msrc') {
    const cvssScore = extractCvssScore(haystack);
    const severity = cvssScore !== null ? classifySeverityFromCvss(cvssScore) : 'low';

    return {
      category,
      severity,
      confidence: 'low',
      cves,
      tags: buildTags(input.sourceName, category, haystack),
      countries: [],
    };
  }

  // gdelt et google_news_fr retombent volontairement ici (pas de branche
  // dediee) : contrairement a MSRC (score CVSS numerique) ou CISA KEV
  // (appartenance = exploitation confirmee), aucune des deux ne fournit de
  // signal deterministe fiable de severite technique -- severite =
  // 'medium' si un CVE est mentionne (rare), sinon 'low'. Le raffinement
  // reel est laisse a la relecture IA (Phase 5, cf. reviewGdeltEvents.ts
  // qui couvre desormais aussi google_news_fr). Note : contrairement a la
  // prose anglaise de gdelt (ou ACTIVE_EXPLOITATION_PATTERN ne matchait
  // jamais), google_news_fr est en francais et peut reellement declencher
  // ce pattern si un titre reprend la formule "activement exploitee".
  const activeExploitation = ACTIVE_EXPLOITATION_PATTERN.test(haystack);
  const severity = classifySeverity(category, cves.length > 0, activeExploitation);

  // countries : uniquement gdelt sait le fournir aujourd'hui (V1LOCATIONS
  // reel, cf. extractCountries dans gdelt/normalize.ts). CERT-FR/CISA/MSRC
  // et google_news_fr n'ont pas de champ geo structure fiable -- laisse a
  // [] plutot que de deviner un pays (ex: France) a partir de la seule
  // locale de recherche, qui ne garantit pas que l'article parle bien de
  // la France.
  const countries = input.sourceName === 'gdelt' ? extractGdeltCountries(input.contentExcerpt) : [];

  return {
    category,
    severity,
    confidence: 'low',
    cves,
    tags: buildTags(input.sourceName, category, haystack),
    countries,
  };
}
