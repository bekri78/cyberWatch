import type { CollectorItem } from '../types';

/**
 * Position des colonnes du fichier GKG 2.1 (tabulation), verifiee sur un
 * vrai fichier reel telecharge par l'utilisateur depuis
 * http://data.gdeltproject.org/gdeltv2/ (cf.
 * tests/collectors/gdelt-fixtures/gkg-sample-real.csv) et recoupee avec le
 * codebook officiel (GDELT-Global_Knowledge_Graph_Codebook-V2.1.pdf). 27
 * colonnes, sans ligne d'en-tete.
 */
const enum Col {
  GkgRecordId = 0,
  V21Date = 1,
  V2DocumentIdentifier = 4,
  V1Themes = 7,
  V1Locations = 9,
  V1Persons = 11,
  V1Organizations = 13,
  V2ExtrasXml = 26,
}

// Signal cyber deterministe (cf. §37/§38 -- verifie sur donnees reelles) :
// CYBER_ATTACK est le theme le plus frequent et le plus fiable (793
// occurrences/jour sur l'echantillon GKG 1.0, present sur 100% des lignes
// avec geolocalisation). WB_2457_CYBER_CRIME est garde comme signal
// independant (constate sur une vraie ligne -- affaire de fraude
// cryptomonnaie en Inde -- aux cotes de CYBER_ATTACK, mais categorie a part
// entiere dans la taxonomie World Bank). Volontairement PAS d'autre regle
// (ex: ECON_BITCOIN+TAX_FNCACT_HACKERS sans CYBER_ATTACK) tant qu'elle n'a
// pas ete observee sur une vraie ligne -- cf. regle du projet : pas de
// classification inventee sans donnee reelle a l'appui.
const CYBER_SIGNAL_THEMES = new Set(['CYBER_ATTACK', 'WB_2457_CYBER_CRIME']);

export function parseThemes(v1Themes: string): string[] {
  return v1Themes
    .split(';')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export function isCyberSignal(themes: string[]): boolean {
  return themes.some((t) => CYBER_SIGNAL_THEMES.has(t));
}

function parseSemicolonList(value: string): string[] {
  return value
    .split(';')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

/**
 * V1LOCATIONS est une liste de blocs separes par ";", chaque bloc separe par
 * "#" : Type#FullName#CountryCode#ADM1Code#Lat#Long#FeatureID (verifie sur de
 * vraies lignes -- cf. tests/collectors/gdelt-fixtures). FullName est soit un
 * pays seul (Type=1, ex "United Kingdom"), soit "Ville, Region, Pays"
 * (Type=3/4/5, ex "Chennai, Tamil Nadu, India") -- dans les deux cas, le
 * dernier segment separe par une virgule EST le nom du pays. Utilise pour
 * peupler cyber_events.countries (aucune source actuelle ne le faisait avant
 * -- cf. §46, verifie sur la prod : countries=[] sur tous les evenements).
 */
export function extractCountries(v1Locations: string): string[] {
  const blocks = parseSemicolonList(v1Locations);
  const countries = new Set<string>();

  for (const block of blocks) {
    const fields = block.split('#');
    const fullName = fields[1]?.trim();
    if (!fullName) continue;
    const segments = fullName.split(',');
    const country = segments[segments.length - 1]?.trim();
    if (country) countries.add(country);
  }

  return [...countries];
}

/**
 * Decodage minimal des entites HTML rencontrees dans V2EXTRASXML (verifie
 * sur une vraie ligne : "&#x20B9;" pour le symbole roupie indienne dans un
 * vrai titre thehindu.com). On ne gere que les formes reellement observees
 * ou standard (numeriques + les 5 entites XML de base) -- pas de
 * bibliotheque HTML complete pour un besoin aussi cible.
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'");
}

/**
 * Le GKG ne fournit pas de champ "titre" dedie -- seul V2EXTRASXML porte un
 * <PAGE_TITLE> (metadonnee extraite de la page HTML source, verifie sur les
 * vraies lignes de l'echantillon). Retourne null si absent : l'appelant
 * ignore alors la ligne plutot que d'inventer un titre.
 */
export function extractPageTitle(extrasXml: string): string | null {
  const match = /<PAGE_TITLE>(.*?)<\/PAGE_TITLE>/.exec(extrasXml);
  const raw = match?.[1];
  if (!raw) return null;
  const title = decodeHtmlEntities(raw).trim();
  return title.length > 0 ? title : null;
}

/**
 * V2.1DATE est au format YYYYMMDDHHMMSS, toujours en UTC (cf. codebook).
 */
export function parseGdeltDate(v21Date: string): Date | null {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(v21Date);
  if (!match) return null;
  const y = Number(match[1]);
  const mo = Number(match[2]);
  const d = Number(match[3]);
  const h = Number(match[4]);
  const mi = Number(match[5]);
  const s = Number(match[6]);
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Le GKG ne fournit jamais le corps de l'article (contrairement a
 * CERT-FR/CISA/MSRC) -- seulement des extractions structurees. contentExcerpt
 * est donc reconstitue a partir de vraies valeurs extraites (organisations,
 * personnes, themes matches), jamais de texte invente, pour donner un
 * minimum de contexte a classifyEvent et a la future relecture IA (Phase 5).
 */
export function buildContentExcerpt(
  matchedThemes: string[],
  organizations: string[],
  persons: string[],
  countries: string[],
): string {
  const parts: string[] = [];
  // "Pays: ..." doit rester un segment reconnaissable tel quel : c'est ce
  // que classifyEvent.extractGdeltCountries() reparse (raw_items ne conserve
  // pas CollectorItem.raw, seulement contentExcerpt -- cf. §46).
  if (countries.length > 0) parts.push(`Pays: ${countries.slice(0, 8).join(', ')}`);
  if (organizations.length > 0) parts.push(`Organisations: ${organizations.slice(0, 8).join(', ')}`);
  if (persons.length > 0) parts.push(`Personnes: ${persons.slice(0, 8).join(', ')}`);
  parts.push(`Themes GDELT: ${matchedThemes.join(', ')}`);
  return parts.join(' — ').slice(0, 2000);
}

/**
 * Convertit une ligne brute du fichier GKG 2.1 en CollectorItem, ou null si
 * la ligne n'est pas un candidat cyber (pas de theme CYBER_ATTACK/
 * WB_2457_CYBER_CRIME) ou s'il manque un champ indispensable (titre, URL,
 * date). C'est le filtre deterministe "recall" : il retient large, la
 * precision fine (ex: la ligne philippinetimes.com de l'echantillon reel,
 * qui porte CYBER_ATTACK mais parle en realite d'agents IA perturbant un
 * forum -- pas une cyberattaque au sens propre) est laissee a la relecture
 * IA (Phase 5, pas encore branchee sur cette source -- cf. §41).
 */
export function normalizeGkgLine(line: string): CollectorItem | null {
  const cols = line.split('\t');
  if (cols.length < 27) return null;

  const themes = parseThemes(cols[Col.V1Themes] ?? '');
  const matchedThemes = themes.filter((t) => CYBER_SIGNAL_THEMES.has(t));
  if (matchedThemes.length === 0) return null;

  const url = cols[Col.V2DocumentIdentifier]?.trim();
  if (!url) return null;

  const title = extractPageTitle(cols[Col.V2ExtrasXml] ?? '');
  if (!title) return null;

  const publishedAt = parseGdeltDate(cols[Col.V21Date] ?? '');
  const organizations = parseSemicolonList(cols[Col.V1Organizations] ?? '');
  const persons = parseSemicolonList(cols[Col.V1Persons] ?? '');
  const countries = extractCountries(cols[Col.V1Locations] ?? '');

  return {
    externalId: cols[Col.GkgRecordId]?.trim() || undefined,
    url,
    title,
    publishedAt,
    contentExcerpt: buildContentExcerpt(matchedThemes, organizations, persons, countries),
    raw: { themes, organizations, persons, countries },
  };
}
