import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Parser from 'rss-parser';
import { describe, expect, it } from 'vitest';
import { normalizeEntry } from '../../src/collectors/certfr/normalize';

/**
 * Ces fixtures sont des copies BRUTES des flux RSS reels de cert.ssi.gouv.fr
 * (colles directement par l'utilisateur depuis son navigateur, cf. §34 --
 * "on doit recuperer la vrai donnee directement"). Ce ne sont pas des
 * donnees fabriquees : c'est exactement ce que renvoie la source en
 * production, fige a un instant donne pour que le test soit reproductible.
 *
 * Objectif : verifier que normalizeEntry() se comporte correctement face au
 * vrai format CERT-FR (accents, prefixes "[MaJ]", descriptions tronquees
 * avec "...", entites XML) et pas seulement face a des fixtures inventees.
 */
const FIXTURES_DIR = join(__dirname, 'certfr-fixtures');

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf-8');
}

const parser = new Parser();

describe('certfr collector -- flux avis reel (cert.ssi.gouv.fr/avis/feed/)', () => {
  it('parse et normalise les 40 vraies entrees sans erreur', async () => {
    const xml = loadFixture('avis-feed-real.xml');
    const feed = await parser.parseString(xml);

    expect(feed.items).toHaveLength(40);

    const items = feed.items.map((entry) => normalizeEntry(entry));

    for (const item of items) {
      expect(item.title).not.toBe('(sans titre)');
      expect(item.url).toMatch(/^https:\/\/www\.cert\.ssi\.gouv\.fr\/avis\/CERTFR-\d{4}-AVI-\d+\/$/);
      expect(item.externalId).toMatch(/^CERTFR-\d{4}-AVI-\d+$/);
      expect(item.publishedAt).toBeInstanceOf(Date);
      expect(item.publishedAt?.getTime()).not.toBeNaN();
      expect(item.contentExcerpt.length).toBeGreaterThan(0);
      expect(item.contentExcerpt.length).toBeLessThanOrEqual(2000);
    }
  });

  it('normalise correctement la plus recente entree reelle du flux avis (F5, 03/09/2026)', async () => {
    const xml = loadFixture('avis-feed-real.xml');
    const feed = await parser.parseString(xml);
    const entry = feed.items.find((item) => item.link?.includes('CERTFR-2026-AVI-1111'));

    expect(entry).toBeDefined();
    const result = normalizeEntry(entry!);

    expect(result.externalId).toBe('CERTFR-2026-AVI-1111');
    expect(result.title).toBe('Multiples vulnérabilités dans les produits F5 (03 septembre 2026)');
    expect(result.publishedAt?.toISOString()).toBe('2026-09-03T00:00:00.000Z');
    expect(result.contentExcerpt).toContain('exécution de code arbitraire');
  });
});

describe('certfr collector -- flux alerte reel (cert.ssi.gouv.fr/alerte/feed/)', () => {
  it('parse et normalise les 40 vraies entrees sans erreur', async () => {
    const xml = loadFixture('alerte-feed-real.xml');
    const feed = await parser.parseString(xml);

    expect(feed.items).toHaveLength(40);

    const items = feed.items.map((entry) => normalizeEntry(entry));

    for (const item of items) {
      expect(item.title).not.toBe('(sans titre)');
      expect(item.url).toMatch(/^https:\/\/www\.cert\.ssi\.gouv\.fr\/alerte\/CERTFR-\d{4}-ALE-\d+\/$/);
      expect(item.externalId).toMatch(/^CERTFR-\d{4}-ALE-\d+$/);
      expect(item.publishedAt).toBeInstanceOf(Date);
      expect(item.publishedAt?.getTime()).not.toBeNaN();
    }
  });

  it('normalise correctement la plus recente alerte reelle (SonicWall SMA, 02/09/2026)', async () => {
    const xml = loadFixture('alerte-feed-real.xml');
    const feed = await parser.parseString(xml);
    const entry = feed.items.find((item) => item.link?.includes('CERTFR-2026-ALE-009'));

    expect(entry).toBeDefined();
    const result = normalizeEntry(entry!);

    expect(result.externalId).toBe('CERTFR-2026-ALE-009');
    expect(result.title).toBe('Multiples vulnérabilités dans SonicWall Secure Mobile Access (02 septembre 2026)');
    expect(result.publishedAt?.toISOString()).toBe('2026-09-02T00:00:00.000Z');
  });

  it("gere correctement un titre reel prefixe [MaJ] (mise a jour) sans le denaturer", async () => {
    const xml = loadFixture('alerte-feed-real.xml');
    const feed = await parser.parseString(xml);
    const entry = feed.items.find((item) => item.link?.includes('CERTFR-2024-ALE-001'));

    expect(entry).toBeDefined();
    const result = normalizeEntry(entry!);

    expect(result.title).toContain('[MàJ]');
    expect(result.externalId).toBe('CERTFR-2024-ALE-001');
  });

  it('normalise la plus ancienne entree reelle du jeu (Exim, 2023)', async () => {
    const xml = loadFixture('alerte-feed-real.xml');
    const feed = await parser.parseString(xml);
    const entry = feed.items.find((item) => item.link?.includes('CERTFR-2023-ALE-010'));

    expect(entry).toBeDefined();
    const result = normalizeEntry(entry!);

    expect(result.externalId).toBe('CERTFR-2023-ALE-010');
    expect(result.publishedAt?.toISOString()).toBe('2023-10-02T00:00:00.000Z');
  });
});
