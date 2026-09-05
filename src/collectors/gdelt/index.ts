import AdmZip from 'adm-zip';
import { withRetry } from '../../lib/http/retry';
import type { Collector, CollectorItem } from '../types';
import { normalizeGkgLine } from './normalize';

const USER_AGENT = 'CyberWatch/0.1 (+https://cyberwatch-production-7503.up.railway.app)';
const BASE_URL = 'http://data.gdeltproject.org/gdeltv2';

// Cadence reelle de GDELT 2.0/2.1 : un fichier GKG toutes les 15 minutes,
// horodate YYYYMMDDHHMMSS aligne sur :00/:15/:30/:45 (verifie via
// lastupdate.txt et sur le vrai fichier fourni par l'utilisateur). Le
// scheduler tourne toutes les 2h (cf. jobs/scheduler.ts) : on rattrape donc
// une fenetre de 3h (marge d'une heure en cas de run manque) plutot que de
// ne prendre que le dernier fichier -- la contrainte UNIQUE(source_id, url)
// evite de redoublonner ce qui a deja ete collecte au run precedent.
const LOOKBACK_MINUTES = 180;
// GDELT publie un fichier quelques minutes apres l'horodatage qu'il porte
// (latence de traitement) -- une petite marge evite de systematiquement
// tenter le tout dernier creneau avant qu'il n'existe.
const PUBLICATION_BUFFER_MINUTES = 10;
const SLOT_MINUTES = 15;

/**
 * Genere les horodatages de fichiers a tenter, du plus recent au plus
 * ancien. Calcul direct par arithmetique de dates (meme choix que
 * getCandidateBulletinIds pour MSRC) plutot que de dependre d'un fichier de
 * decouverte (masterfilelist.txt, plusieurs Mo et des annees d'historique) --
 * inutile ici puisque le nommage des fichiers est entierement previsible.
 */
export function getCandidateFileTimestamps(
  now: Date,
  lookbackMinutes = LOOKBACK_MINUTES,
  bufferMinutes = PUBLICATION_BUFFER_MINUTES,
): string[] {
  const anchor = new Date(now.getTime() - bufferMinutes * 60_000);
  const flooredMinutes = Math.floor(anchor.getUTCMinutes() / SLOT_MINUTES) * SLOT_MINUTES;
  const latestSlot = new Date(
    Date.UTC(
      anchor.getUTCFullYear(),
      anchor.getUTCMonth(),
      anchor.getUTCDate(),
      anchor.getUTCHours(),
      flooredMinutes,
      0,
    ),
  );

  const slotCount = Math.ceil(lookbackMinutes / SLOT_MINUTES);
  const timestamps: string[] = [];

  for (let i = 0; i < slotCount; i++) {
    const slot = new Date(latestSlot.getTime() - i * SLOT_MINUTES * 60_000);
    const y = slot.getUTCFullYear();
    const mo = String(slot.getUTCMonth() + 1).padStart(2, '0');
    const d = String(slot.getUTCDate()).padStart(2, '0');
    const h = String(slot.getUTCHours()).padStart(2, '0');
    const mi = String(slot.getUTCMinutes()).padStart(2, '0');
    timestamps.push(`${y}${mo}${d}${h}${mi}00`);
  }

  return timestamps;
}

/**
 * Deduplication par titre normalise, en plus de UNIQUE(source_id, url) en
 * base. Constate sur un vrai fichier : une meme depeche republiee mot pour
 * mot par 4 sites clones differents (philippinetimes.com, japanherald.com,
 * haitisun.com, zimbabwestar.com -- meme suffixe numerique d'URL, URLs
 * distinctes) -- la contrainte UNIQUE(url) seule ne l'aurait pas filtree
 * (cf. dedupeByCve dans msrc/index.ts, meme principe applique a une cause
 * de duplication differente).
 */
export function dedupeByTitle(items: CollectorItem[]): CollectorItem[] {
  const seen = new Set<string>();
  const result: CollectorItem[] = [];
  for (const item of items) {
    const key = item.title.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

async function fetchGkgFile(timestamp: string): Promise<CollectorItem[] | 'not_available'> {
  const response = await fetch(`${BASE_URL}/${timestamp}.gkg.csv.zip`, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (response.status === 404) {
    // Creneau pas encore publie (ou fenetre de rattrapage remontant avant le
    // debut reel des donnees) -- pas un echec de la source.
    return 'not_available';
  }

  if (!response.ok) {
    throw new Error(`GDELT a repondu ${response.status} ${response.statusText} pour ${timestamp}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  const entry = entries[0];
  if (!entry) return 'not_available';

  const csv = entry.getData().toString('utf-8');
  const items: CollectorItem[] = [];

  for (const line of csv.split('\n')) {
    const trimmed = line.replace(/\r$/, '');
    if (!trimmed) continue;
    const item = normalizeGkgLine(trimmed);
    if (item) items.push(item);
  }

  return items;
}

export const gdeltCollector: Collector = {
  name: 'gdelt',
  sourceType: 'csv',

  async collect(): Promise<CollectorItem[]> {
    const timestamps = getCandidateFileTimestamps(new Date());
    const items: CollectorItem[] = [];
    const errors: string[] = [];
    let anySucceeded = false;

    for (const timestamp of timestamps) {
      try {
        const result = await withRetry(() => fetchGkgFile(timestamp));
        if (result !== 'not_available') {
          items.push(...result);
        }
        anySucceeded = true;
      } catch (err) {
        errors.push(`${timestamp}: ${(err as Error).message}`);
      }
    }

    if (!anySucceeded) {
      // Aucun des creneaux de la fenetre n'a pu etre recupere (pas de simple
      // "pas encore publie") : echec total de la source, meme logique que
      // CERT-FR/MSRC (cf. §31).
      throw new Error(`Tous les creneaux GDELT cibles ont echoue -- ${errors.join(' | ')}`);
    }

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.error(`[gdelt] echec partiel : ${errors.join(' | ')}`);
    }

    return dedupeByTitle(items);
  },
};
