import { describe, expect, it } from 'vitest';
import { normalizeEntry } from '../../src/collectors/bleepingComputer/normalize';

// Fixture representative de la structure reelle du flux BleepingComputer
// (title/link/guid/pubDate/description, dc:creator, category) -- utilisee
// au lieu d'un appel reseau reel (flux inaccessible depuis cet
// environnement de developpement, meme contrainte que hackerNews/certfr ;
// structure verifiee via WebFetch le 2026-09-13, cf.
// hackerNews-normalize.test.ts pour la meme methode sur une autre source).
const REAL_ENTRY_FIXTURE = {
  title: 'Hackers exploit Tencent app flaw to deploy GrayRabbit malware',
  link: 'https://www.bleepingcomputer.com/news/security/hackers-exploit-tencent-app-flaw-to-deploy-grayrabbit-malware/',
  guid: 'https://www.bleepingcomputer.com/news/security/hackers-exploit-tencent-app-flaw-to-deploy-grayrabbit-malware/',
  isoDate: '2026-09-13T14:26:32.000Z',
  creator: 'Bill Toulas',
  contentSnippet:
    "Threat actors linked to a China-aligned espionage group are exploiting a critical vulnerability " +
    "(CVE-2026-51990) in Tencent's Sogou Input Method for Windows to deploy the GrayRabbit backdoor.",
  content: "<p>Threat actors linked to a China-aligned espionage group...</p>",
};

describe('normalizeEntry', () => {
  it('normalise une entree reelle en CollectorItem', () => {
    const result = normalizeEntry(REAL_ENTRY_FIXTURE);

    expect(result).toMatchObject({
      externalId: 'https://www.bleepingcomputer.com/news/security/hackers-exploit-tencent-app-flaw-to-deploy-grayrabbit-malware/',
      url: 'https://www.bleepingcomputer.com/news/security/hackers-exploit-tencent-app-flaw-to-deploy-grayrabbit-malware/',
      title: 'Hackers exploit Tencent app flaw to deploy GrayRabbit malware',
    });
    expect(result.publishedAt).toBeInstanceOf(Date);
    expect(result.publishedAt?.toISOString()).toBe('2026-09-13T14:26:32.000Z');
    expect(result.contentExcerpt).toContain('CVE-2026-51990');
    expect(result.raw).toBe(REAL_ENTRY_FIXTURE);
  });

  it('gere une entree sans guid en repli sur undefined (jamais de valeur inventee)', () => {
    const result = normalizeEntry({
      title: 'Un article sans guid',
      link: 'https://www.bleepingcomputer.com/news/security/sans-guid/',
    });

    expect(result.externalId).toBeUndefined();
    expect(result.url).toBe('https://www.bleepingcomputer.com/news/security/sans-guid/');
  });

  it('gere une entree sans titre, date ni contenu sans planter', () => {
    const result = normalizeEntry({ link: 'https://www.bleepingcomputer.com/news/security/vide/' });

    expect(result.title).toBe('(sans titre)');
    expect(result.publishedAt).toBeNull();
    expect(result.contentExcerpt).toBe('');
    expect(result.url).toBe('https://www.bleepingcomputer.com/news/security/vide/');
  });

  it('tronque un extrait de contenu trop long (meme regle que certfr/hackernews, cf. §34)', () => {
    const longText = 'a'.repeat(5000);
    const result = normalizeEntry({
      title: 'Test',
      link: 'https://www.bleepingcomputer.com/x',
      contentSnippet: longText,
    });

    expect(result.contentExcerpt.length).toBe(2000);
  });
});
