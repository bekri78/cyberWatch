import { describe, expect, it } from 'vitest';
import { getCandidateBulletinIds } from '../../src/collectors/msrc';

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
