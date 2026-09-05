import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dedupeByTitle, getCandidateFileTimestamps } from '../../src/collectors/gdelt';
import { normalizeGkgLine } from '../../src/collectors/gdelt/normalize';
import type { CollectorItem } from '../../src/collectors/types';

describe('getCandidateFileTimestamps', () => {
  it('genere des creneaux de 15 min alignes, avec la marge de publication appliquee', () => {
    // 07:15:00 - 10 min de marge = 07:05:00 -> arrondi au creneau <= 07:00:00.
    const timestamps = getCandidateFileTimestamps(new Date('2026-09-05T07:15:00Z'), 45, 10);
    expect(timestamps).toEqual(['20260905070000', '20260905064500', '20260905063000']);
  });

  it('couvre le passage a minuit (jour precedent)', () => {
    // 00:05:00 - 10 min de marge = 2026-09-04T23:55:00Z -> arrondi au creneau
    // <= 23:45:00, la veille.
    const timestamps = getCandidateFileTimestamps(new Date('2026-09-05T00:05:00Z'), 30, 10);
    expect(timestamps).toEqual(['20260904234500', '20260904233000']);
  });

  it('la fenetre par defaut (3h) couvre 12 creneaux de 15 min', () => {
    expect(getCandidateFileTimestamps(new Date('2026-09-05T12:00:00Z'))).toHaveLength(12);
  });
});

/**
 * Reprend le meme scenario reel que gdelt-normalize.test.ts (4 vraies lignes
 * clones, meme titre exact republie par philippinetimes.com/japanherald.com/
 * haitisun.com/zimbabwestar.com) pour verifier que dedupeByTitle -- utilise
 * par collect() -- filtre bien ce cas reellement observe.
 */
const FIXTURES_DIR = join(__dirname, 'gdelt-fixtures');

function loadRealCloneItems(): CollectorItem[] {
  const raw = readFileSync(join(FIXTURES_DIR, 'gkg-sample-real.csv'), 'utf-8');
  const lines = raw
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .filter(
      (l) =>
        l.includes('philippinetimes.com') ||
        l.includes('japanherald.com') ||
        l.includes('haitisun.com') ||
        l.includes('zimbabwestar.com'),
    );
  return lines.map((l) => normalizeGkgLine(l)!).filter(Boolean);
}

describe('dedupeByTitle', () => {
  it('elimine les 3 doublons reels (4 sites clones, 1 seule vraie depeche)', () => {
    const items = loadRealCloneItems();
    expect(items).toHaveLength(4); // avant dedup : 4 items distincts (URLs differentes)

    const result = dedupeByTitle(items);

    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe('OpenAI agents turned German website into message board  Reuters');
  });

  it('conserve des titres reellement distincts', () => {
    const items: CollectorItem[] = [
      { externalId: '1', url: 'https://a.example/1', title: 'Titre A', publishedAt: null, contentExcerpt: '', raw: null },
      { externalId: '2', url: 'https://b.example/2', title: 'Titre B', publishedAt: null, contentExcerpt: '', raw: null },
    ];
    expect(dedupeByTitle(items)).toHaveLength(2);
  });

  it('la comparaison ignore la casse (variation de capitalisation entre republications)', () => {
    const items: CollectorItem[] = [
      { externalId: '1', url: 'https://a.example/1', title: 'Meme Titre', publishedAt: null, contentExcerpt: '', raw: null },
      { externalId: '2', url: 'https://b.example/2', title: 'meme titre', publishedAt: null, contentExcerpt: '', raw: null },
    ];
    expect(dedupeByTitle(items)).toHaveLength(1);
  });
});
