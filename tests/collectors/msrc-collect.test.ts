import { describe, expect, it } from 'vitest';
import { dedupeByCve, getCandidateBulletinIds } from '../../src/collectors/msrc';
import type { CollectorItem } from '../../src/collectors/types';

describe('getCandidateBulletinIds', () => {
  it('renvoie [mois precedent, mois courant] au format "{Annee}-{MoisAbrege}"', () => {
    // 2026-09-05, cf. format reel verifie via https://api.msrc.microsoft.com/cvrf/v3.0/updates
    expect(getCandidateBulletinIds(new Date('2026-09-05T12:00:00Z'))).toEqual(['2026-Aug', '2026-Sep']);
  });

  it('gere le passage a l\'annee suivante (janvier -> decembre annee precedente)', () => {
    expect(getCandidateBulletinIds(new Date('2026-01-15T00:00:00Z'))).toEqual(['2025-Dec', '2026-Jan']);
  });

  it('gere le debut de mois (bulletin du mois courant probablement pas encore publie)', () => {
    expect(getCandidateBulletinIds(new Date('2026-09-01T00:00:00Z'))).toEqual(['2026-Aug', '2026-Sep']);
  });
});

function makeItem(externalId: string, title: string): CollectorItem {
  return { externalId, url: `https://msrc.microsoft.com/update-guide/vulnerability/${externalId}`, title, publishedAt: null, contentExcerpt: '', raw: null };
}

describe('dedupeByCve', () => {
  it('elimine un CVE repete (cas reel observe en production le 05/09/2026 : CVE-2026-80616 en double)', () => {
    const items = [
      makeItem('CVE-2026-80616', 'ieee802154: Avoid calling WARN_ON() on -ENOMEM in cfg802154_switch_netns()'),
      makeItem('CVE-2026-80709', 's390/zcrypt: Fix wrong domain value verification with EP11 CPRBs'),
      makeItem('CVE-2026-80616', 'ieee802154: Avoid calling WARN_ON() on -ENOMEM in cfg802154_switch_netns()'),
    ];

    const result = dedupeByCve(items);

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.externalId)).toEqual(['CVE-2026-80616', 'CVE-2026-80709']);
  });

  it('conserve les items sans externalId (ne les deduplique jamais entre eux)', () => {
    const items = [
      { ...makeItem('', 'item sans id 1'), externalId: undefined },
      { ...makeItem('', 'item sans id 2'), externalId: undefined },
    ];

    expect(dedupeByCve(items)).toHaveLength(2);
  });
});
