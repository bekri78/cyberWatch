import { describe, expect, it } from 'vitest';
import { normalizeEntry } from '../../src/collectors/hackerNews/normalize';

// Fixture representative de la structure reelle du flux FeedBurner de The
// Hacker News (title/link/guid/pubDate/description, guid isPermaLink="false"
// identique a link) -- utilisee au lieu d'un appel reseau reel (flux
// inaccessible depuis cet environnement de developpement, meme contrainte
// que googleNewsFr/certfr ; structure verifiee via WebFetch le 2026-09-13,
// cf. googleNewsFr-normalize.test.ts pour la meme methode sur une autre
// source).
const REAL_ENTRY_FIXTURE = {
  title: 'Attackers Use Passkey Phishing to Hijack Microsoft Cloud Accounts and Exfiltrate Data',
  link: 'https://thehackernews.com/2026/09/attackers-use-passkey-phishing-to.html',
  guid: 'https://thehackernews.com/2026/09/attackers-use-passkey-phishing-to.html',
  isoDate: '2026-09-13T10:11:48.000Z',
  contentSnippet:
    'Microsoft has disclosed details of two campaigns in which threat actors are abusing ' +
    'third-party email delivery infrastructure to blast financial fraud scam messages and using ' +
    'passkey-themed social engineering to breach cloud environments.',
  content: '<p>Microsoft has disclosed details of two campaigns...</p>',
};

describe('normalizeEntry', () => {
  it('normalise une entree reelle en CollectorItem', () => {
    const result = normalizeEntry(REAL_ENTRY_FIXTURE);

    expect(result).toMatchObject({
      externalId: 'https://thehackernews.com/2026/09/attackers-use-passkey-phishing-to.html',
      url: 'https://thehackernews.com/2026/09/attackers-use-passkey-phishing-to.html',
      title: 'Attackers Use Passkey Phishing to Hijack Microsoft Cloud Accounts and Exfiltrate Data',
    });
    expect(result.publishedAt).toBeInstanceOf(Date);
    expect(result.publishedAt?.toISOString()).toBe('2026-09-13T10:11:48.000Z');
    expect(result.contentExcerpt).toContain('passkey-themed social engineering');
    expect(result.raw).toBe(REAL_ENTRY_FIXTURE);
  });

  it('gere une entree sans guid en repli sur undefined (jamais de valeur inventee)', () => {
    const result = normalizeEntry({
      title: 'Un article sans guid',
      link: 'https://thehackernews.com/2026/09/sans-guid.html',
    });

    expect(result.externalId).toBeUndefined();
    expect(result.url).toBe('https://thehackernews.com/2026/09/sans-guid.html');
  });

  it('gere une entree sans titre, date ni contenu sans planter', () => {
    const result = normalizeEntry({ link: 'https://thehackernews.com/2026/09/vide.html' });

    expect(result.title).toBe('(sans titre)');
    expect(result.publishedAt).toBeNull();
    expect(result.contentExcerpt).toBe('');
    expect(result.url).toBe('https://thehackernews.com/2026/09/vide.html');
  });

  it('tronque un extrait de contenu trop long (meme regle que certfr, cf. §34)', () => {
    const longText = 'a'.repeat(5000);
    const result = normalizeEntry({
      title: 'Test',
      link: 'https://thehackernews.com/x',
      contentSnippet: longText,
    });

    expect(result.contentExcerpt.length).toBe(2000);
  });
});
