import { describe, expect, it } from 'vitest';
import { dedupeByTitle } from '../../src/collectors/googleNewsFr';
import type { CollectorItem } from '../../src/collectors/types';

// dedupeByTitle reprend exactement la logique deja verifiee sur donnees
// reelles pour gdelt (cf. tests/collectors/gdelt-collect.test.ts) --
// meme scenario de duplication par syndication, transpose a une autre
// source. Pas de fixture "reelle" de doublon Google Actualites disponible
// ici (flux inaccessible depuis cet environnement, cf. googleNewsFr-
// normalize.test.ts) : ces deux cas couvrent le comportement generique de
// la fonction, deja eprouve ailleurs sur un vrai cas de doublon.
describe('dedupeByTitle', () => {
  it('conserve des titres reellement distincts', () => {
    const items: CollectorItem[] = [
      { url: 'https://news.google.com/rss/articles/1', title: 'Titre A', publishedAt: null, contentExcerpt: '', raw: null },
      { url: 'https://news.google.com/rss/articles/2', title: 'Titre B', publishedAt: null, contentExcerpt: '', raw: null },
    ];
    expect(dedupeByTitle(items)).toHaveLength(2);
  });

  it('elimine un doublon de titre repris par plusieurs medias (syndication), casse ignoree', () => {
    const items: CollectorItem[] = [
      {
        url: 'https://news.google.com/rss/articles/lemonde',
        title: "Une cyberattaque vise un hôpital français",
        publishedAt: null,
        contentExcerpt: 'Média : Le Monde',
        raw: null,
      },
      {
        url: 'https://news.google.com/rss/articles/afp',
        title: "une cyberattaque vise un hôpital français",
        publishedAt: null,
        contentExcerpt: 'Média : AFP',
        raw: null,
      },
    ];

    const result = dedupeByTitle(items);
    expect(result).toHaveLength(1);
    expect(result[0]!.contentExcerpt).toBe('Média : Le Monde'); // conserve la premiere occurrence
  });
});
