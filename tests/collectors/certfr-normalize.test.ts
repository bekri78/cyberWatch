import { describe, expect, it } from 'vitest';
import { extractExternalId, normalizeEntry } from '../../src/collectors/certfr/normalize';

// Fixture representative du format des entrees CERT-FR (structure reelle
// observee sur cert.ssi.gouv.fr), utilisee au lieu d'un appel reseau reel
// (cf. cahier des charges §34 : "utiliser des fixtures/mocks").
const AVIS_ENTRY_FIXTURE = {
  title: 'Vulnérabilités dans Microsoft Exchange Server',
  link: 'https://cert.ssi.gouv.fr/avis/CERTFR-2026-AVI-0512/',
  isoDate: '2026-09-03T09:30:00.000Z',
  contentSnippet:
    'De multiples vulnérabilités ont été découvertes dans Microsoft Exchange Server. ' +
    'Certaines d\'entre elles permettent à un attaquant de provoquer une exécution de code arbitraire à distance.',
  content: '<p>De multiples vulnérabilités...</p>',
};

const ALERTE_ENTRY_FIXTURE = {
  title: 'Campagne d\'exploitation active visant des routeurs Cisco',
  link: 'https://cert.ssi.gouv.fr/alerte/CERTFR-2026-ALE-0009/',
  isoDate: '2026-09-04T07:00:00.000Z',
  contentSnippet: 'Le CERT-FR a connaissance d\'une exploitation active.',
};

describe('extractExternalId', () => {
  it('extrait un identifiant CERTFR de type avis', () => {
    expect(extractExternalId('https://cert.ssi.gouv.fr/avis/CERTFR-2026-AVI-0512/')).toBe(
      'CERTFR-2026-AVI-0512',
    );
  });

  it('extrait un identifiant CERTFR de type alerte', () => {
    expect(extractExternalId('https://cert.ssi.gouv.fr/alerte/CERTFR-2026-ALE-0009/')).toBe(
      'CERTFR-2026-ALE-0009',
    );
  });

  it('renvoie undefined si aucun identifiant ne correspond', () => {
    expect(extractExternalId('https://cert.ssi.gouv.fr/actualite/quelque-chose/')).toBeUndefined();
    expect(extractExternalId(undefined)).toBeUndefined();
  });
});

describe('normalizeEntry', () => {
  it('normalise une entree avis en CollectorItem', () => {
    const result = normalizeEntry(AVIS_ENTRY_FIXTURE);

    expect(result).toMatchObject({
      externalId: 'CERTFR-2026-AVI-0512',
      url: 'https://cert.ssi.gouv.fr/avis/CERTFR-2026-AVI-0512/',
      title: 'Vulnérabilités dans Microsoft Exchange Server',
    });
    expect(result.publishedAt).toBeInstanceOf(Date);
    expect(result.publishedAt?.toISOString()).toBe('2026-09-03T09:30:00.000Z');
    expect(result.contentExcerpt).toContain('exécution de code arbitraire');
    expect(result.raw).toBe(AVIS_ENTRY_FIXTURE);
  });

  it('normalise une entree alerte en CollectorItem', () => {
    const result = normalizeEntry(ALERTE_ENTRY_FIXTURE);

    expect(result.externalId).toBe('CERTFR-2026-ALE-0009');
    expect(result.title).toBe('Campagne d\'exploitation active visant des routeurs Cisco');
  });

  it('gere une entree sans date ni titre sans planter', () => {
    const result = normalizeEntry({ link: 'https://cert.ssi.gouv.fr/avis/CERTFR-2026-AVI-9999/' });

    expect(result.title).toBe('(sans titre)');
    expect(result.publishedAt).toBeNull();
    expect(result.contentExcerpt).toBe('');
  });

  it('tronque un extrait de contenu trop long', () => {
    const longText = 'a'.repeat(5000);
    const result = normalizeEntry({ title: 'Test', link: 'https://x/y', contentSnippet: longText });

    expect(result.contentExcerpt.length).toBe(2000);
  });
});
