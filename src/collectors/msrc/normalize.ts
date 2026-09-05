import type { CollectorItem } from '../types';

/**
 * Vue partielle d'un noeud <vuln:Vulnerability> du CVRF MSRC une fois passe
 * par fast-xml-parser (ignoreAttributes: false, attributeNamePrefix: '@_').
 * On ne type que ce dont on se sert -- le reste est conserve dans `raw`
 * (cf. meme choix que cisaKev/normalize.ts). Les champs repetables peuvent
 * arriver en objet unique OU en tableau selon le nombre d'occurrences reelles
 * (comportement standard fast-xml-parser) -- cf. toArray() ci-dessous, verifie
 * sur le vrai document CVRF 2026-Feb colle par l'utilisateur.
 */
export interface MsrcNote {
  '#text'?: string;
  '@_Title'?: string;
  '@_Type'?: string;
}

export interface MsrcScoreSet {
  'vuln:BaseScore'?: number | string;
  'vuln:Vector'?: string;
}

export interface MsrcRevision {
  'cvrf:Date'?: string;
}

export interface MsrcVulnerability {
  'vuln:Title'?: string;
  'vuln:CVE'?: string;
  'vuln:Notes'?: { 'vuln:Note'?: MsrcNote | MsrcNote[] };
  'vuln:CVSSScoreSets'?: { 'vuln:ScoreSet'?: MsrcScoreSet | MsrcScoreSet[] };
  'vuln:RevisionHistory'?: { 'vuln:Revision'?: MsrcRevision | MsrcRevision[] };
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Le champ Description des notes CVRF est souvent une balise auto-fermante
 * (<vuln:Note Title="Description" Type="Description" Ordinal="0"/>) --
 * verifie sur le vrai document : aucune cle "#text" n'existe alors dans le
 * JS parse, contrairement a un texte non vide. On retombe sur le titre dans
 * ce cas (cf. normalizeVulnerability).
 */
function extractDescriptionNote(vuln: MsrcVulnerability): string | undefined {
  const notes = toArray(vuln['vuln:Notes']?.['vuln:Note']);
  const descriptionNote = notes.find((note) => note['@_Type'] === 'Description');
  return descriptionNote?.['#text'];
}

/**
 * Un meme CVE a un ScoreSet par produit affecte, avec generalement le meme
 * BaseScore (verifie sur le vrai document) -- on prend le plus eleve par
 * prudence si jamais ils divergent un jour, plutot que le premier arbitraire.
 */
function extractMaxBaseScore(vuln: MsrcVulnerability): number | null {
  const scoreSets = toArray(vuln['vuln:CVSSScoreSets']?.['vuln:ScoreSet']);
  const scores = scoreSets
    .map((set) => Number(set['vuln:BaseScore']))
    .filter((score) => Number.isFinite(score));

  return scores.length > 0 ? Math.max(...scores) : null;
}

/**
 * Date de premiere publication = la plus ancienne des revisions. Verifie sur
 * le vrai document : l'ordre des <vuln:Revision> dans le XML n'est PAS
 * garanti chronologique (le cas 0 les liste 2.0 puis 1.0, le cas 1 les liste
 * 1.0 puis 2.0) -- il faut donc explicitement prendre le minimum plutot que
 * le premier ou dernier element du tableau.
 */
function extractEarliestRevisionDate(vuln: MsrcVulnerability): Date | null {
  const revisions = toArray(vuln['vuln:RevisionHistory']?.['vuln:Revision']);
  const dates = revisions
    .map((rev) => rev['cvrf:Date'])
    .filter((date): date is string => Boolean(date))
    .map((date) => new Date(date.endsWith('Z') ? date : `${date}Z`))
    .filter((date) => !Number.isNaN(date.getTime()));

  if (dates.length === 0) return null;
  return new Date(Math.min(...dates.map((date) => date.getTime())));
}

/**
 * Convertit un noeud <vuln:Vulnerability> CVRF en CollectorItem commun.
 * Fonction pure, testable sans reseau (cf. cisaKev/normalize.ts, meme
 * philosophie).
 *
 * Contrairement a CERT-FR/CISA KEV, MSRC fournit un score CVSS numerique
 * fiable par CVE -- on l'ecrit deliberement dans contentExcerpt au format
 * "CVSS X.X" pour que classifyEvent puisse en deriver une severite par
 * bande CVSS standard (bien plus precis que la detection de phrase
 * "activement exploitee", inapplicable a la prose anglaise de MSRC).
 *
 * Retourne null si le noeud n'a pas de CVE exploitable (rare, mais possible
 * pour certaines entrees MSRC sans CVE assigne) -- filtre en amont par
 * l'appelant plutot que de fabriquer un identifiant arbitraire.
 */
export function normalizeVulnerability(vuln: MsrcVulnerability): CollectorItem | null {
  const cve = vuln['vuln:CVE']?.trim();
  if (!cve) return null;

  const vulnTitle = vuln['vuln:Title']?.trim() || '(sans titre)';
  const descriptionText = extractDescriptionNote(vuln)?.trim();
  const baseScore = extractMaxBaseScore(vuln);
  const baseText = descriptionText || vulnTitle;
  const contentExcerpt = (baseScore !== null ? `CVSS ${baseScore.toFixed(1)} — ${baseText}` : baseText).slice(
    0,
    2000,
  );

  return {
    externalId: cve,
    url: `https://msrc.microsoft.com/update-guide/vulnerability/${cve}`,
    title: `${cve} - ${vulnTitle}`,
    publishedAt: extractEarliestRevisionDate(vuln),
    contentExcerpt,
    raw: vuln,
  };
}
