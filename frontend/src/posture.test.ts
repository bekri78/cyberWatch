import { describe, expect, it } from 'vitest';
import type { CyberEvent } from './api/types';
import { buildIndicators, countEventsByCountry, derivePosture } from './posture';

function makeEvent(overrides: Partial<CyberEvent> = {}): CyberEvent {
  return {
    id: 'x',
    title: 'Titre',
    summary: 'Resume',
    description: null,
    category: 'attack',
    severity: 'low',
    confidence: 'low',
    publishedAt: new Date().toISOString(),
    firstSeenAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    countries: [],
    organizations: [],
    sectors: [],
    cves: [],
    threatActors: [],
    mitreTechniques: [],
    tags: ['gdelt', 'attack'],
    aiGenerated: false,
    ...overrides,
  };
}

describe('derivePosture', () => {
  it('passe en critique des qu\'un seul evenement critique est present', () => {
    const events = [makeEvent({ severity: 'critical' }), makeEvent({ severity: 'low' })];
    expect(derivePosture(events, events.length).key).toBe('critique');
  });

  it('passe en eleve a partir de 5 evenements de severite high', () => {
    const events = Array.from({ length: 5 }, () => makeEvent({ severity: 'high' }));
    expect(derivePosture(events, events.length).key).toBe('eleve');
  });

  it('passe en renforce pour 1 a 4 evenements de severite high', () => {
    const events = [makeEvent({ severity: 'high' })];
    expect(derivePosture(events, events.length).key).toBe('renforce');
  });

  it('reste normal sans severite elevee ou critique', () => {
    const events = [makeEvent({ severity: 'low' }), makeEvent({ severity: 'medium' })];
    expect(derivePosture(events, events.length).key).toBe('normal');
  });
});

describe('buildIndicators', () => {
  it('compte les pays et sources distincts a partir des vrais champs', () => {
    const events = [
      makeEvent({ countries: ['India'], tags: ['gdelt', 'attack'] }),
      makeEvent({ countries: ['India', 'Germany'], tags: ['certfr', 'alert'] }),
    ];
    const indicators = buildIndicators(events);

    expect(indicators.find((i) => i.label === 'Evenements')?.value).toBe(2);
    expect(indicators.find((i) => i.label === 'Pays cites')?.value).toBe(2);
    expect(indicators.find((i) => i.label === 'Sources actives')?.value).toBe(2);
  });
});

describe('countEventsByCountry', () => {
  it('agrege le nombre d\'evenements par pays reel (champ countries[])', () => {
    const events = [
      makeEvent({ countries: ['India'] }),
      makeEvent({ countries: ['India', 'Germany'] }),
      makeEvent({ countries: [] }),
    ];
    const counts = countEventsByCountry(events);

    expect(counts.get('India')).toBe(2);
    expect(counts.get('Germany')).toBe(1);
    expect(counts.size).toBe(2);
  });
});
