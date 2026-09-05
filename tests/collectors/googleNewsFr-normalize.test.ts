import { describe, expect, it } from 'vitest';
import { buildContentExcerpt, extractSourceName, normalizeEntry } from '../../src/collectors/googleNewsFr/normalize';

// Fixture representative du format documente de Google Actualites (balise
// <source> dediee portant le nom du media, en plus des champs RSS
// standard title/link/pubDate) -- utilisee au lieu d'un appel reseau reel
// (le flux news.google.com est inaccessible depuis cet environnement de
// developpement, cf. echange du 2026-09-05 ; le premier passage reel en
// production sera verifie via les logs Railway, meme methode que pour la
// verification du compte rendu Phase 6.1).
const ENTRY_WITH_STRING_SOURCE = {
  title: "Une cyberattaque frappe un hôpital français",
  link: 'https://news.google.com/rss/articles/CBMiabc123',
  isoDate: '2026-09-05T08:00:00.000Z',
  guid: 'https://news.google.com/rss/articles/CBMiabc123',
  source: 'Le Monde',
};

const ENTRY_WITH_OBJECT_SOURCE = {
  title: 'Fuite de données chez un opérateur télécom',
  link: 'https://news.google.com/rss/articles/CBMixyz789',
  isoDate: '2026-09-05T09:00:00.000Z',
  source: { _: 'France Info', $: { url: 'https://www.francetvinfo.fr' } },
};

describe('extractSourceName', () => {
  it('extrait le nom du media quand la balise <source> arrive comme chaine simple', () => {
    expect(extractSourceName(ENTRY_WITH_STRING_SOURCE)).toBe('Le Monde');
  });

  it("extrait le nom du media quand la balise <source> arrive comme objet (xml2js, attribut url a part)", () => {
    expect(extractSourceName(ENTRY_WITH_OBJECT_SOURCE)).toBe('France Info');
  });

  it('renvoie undefined si la balise source est absente', () => {
    expect(extractSourceName({ title: 'Titre sans source' })).toBeUndefined();
  });

  it('renvoie undefined pour une chaine source vide plutot que de deviner', () => {
    expect(extractSourceName({ source: '   ' })).toBeUndefined();
  });
});

describe('buildContentExcerpt', () => {
  it('mentionne le media reel quand il est connu', () => {
    expect(buildContentExcerpt('Le Monde')).toBe('Média : Le Monde');
  });

  it('reste une chaine vide quand le media est inconnu (jamais de valeur inventee)', () => {
    expect(buildContentExcerpt(undefined)).toBe('');
  });
});

describe('normalizeEntry', () => {
  it('normalise une entree avec source en chaine simple', () => {
    const result = normalizeEntry(ENTRY_WITH_STRING_SOURCE);

    expect(result.title).toBe("Une cyberattaque frappe un hôpital français");
    expect(result.url).toBe('https://news.google.com/rss/articles/CBMiabc123');
    expect(result.externalId).toBe('https://news.google.com/rss/articles/CBMiabc123');
    expect(result.publishedAt).toBeInstanceOf(Date);
    expect(result.publishedAt?.toISOString()).toBe('2026-09-05T08:00:00.000Z');
    expect(result.contentExcerpt).toBe('Média : Le Monde');
  });

  it('normalise une entree avec source en objet', () => {
    const result = normalizeEntry(ENTRY_WITH_OBJECT_SOURCE);

    expect(result.contentExcerpt).toBe('Média : France Info');
    expect(result.externalId).toBeUndefined(); // pas de guid dans cette fixture
  });

  it('gere une entree sans titre, date ni source sans planter', () => {
    const result = normalizeEntry({ link: 'https://news.google.com/rss/articles/CBMinone' });

    expect(result.title).toBe('(sans titre)');
    expect(result.publishedAt).toBeNull();
    expect(result.contentExcerpt).toBe('');
    expect(result.url).toBe('https://news.google.com/rss/articles/CBMinone');
  });

  it('conserve le titre brut tel quel, meme s\'il contient un tiret (jamais de decoupage de texte libre)', () => {
    const result = normalizeEntry({
      title: 'Attaque en cours - point de situation',
      link: 'https://news.google.com/rss/articles/CBMidash',
    });

    expect(result.title).toBe('Attaque en cours - point de situation');
  });
});
