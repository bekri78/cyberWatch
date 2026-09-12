// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import L from 'leaflet';
import ExplorationMap from './ExplorationMap';
import ExplorationPage from '../pages/ExplorationPage';
import type { CyberEvent, ExplorationResult, MapPublication } from '../api/types';
import { publicationPoints } from './explorationPoints';

const { fetchExploration, fetchEvent } = vi.hoisted(() => ({ fetchExploration: vi.fn(), fetchEvent: vi.fn() }));
vi.mock('../api/client', () => ({ fetchExploration, fetchEvent, MAP_TILE_URL: '/tiles/{z}/{x}/{y}.png' }));

let root: Root;
let host: HTMLDivElement;
let resize: () => void;
let mapSpy: MockInstance<typeof L.map>;
const items: MapPublication[] = [{ id: 'fr', title: 'Publication France', countries: ['France'], severity: 'high' }, { id: 'de', title: 'Publication Allemagne', countries: ['Germany'], severity: 'low' }];

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback; }
    observe() {} disconnect() {}
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1024);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(640);
  mapSpy = vi.spyOn(L, 'map');
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  fetchExploration.mockReset();
  fetchEvent.mockReset();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function map() { return mapSpy.mock.results[0].value as L.Map; }
function markers() { return [...host.querySelectorAll<HTMLElement>('.ex-leaflet-marker[aria-label]')]; }

describe('Exploration map interactions', () => {
  it('keeps the same map, center and zoom through selection, data updates and resize', async () => {
    const select = vi.fn();
    await act(async () => root.render(<ExplorationMap items={items} country="" onReset={() => {}} selected="" onSelect={select} />));
    map().setView([48, 4], 7, { animate: false });
    const center = map().getCenter();
    const france = markers().find(e => e.getAttribute('aria-label')?.startsWith('Publication France'))!;
    await act(async () => france.click());
    expect(select).toHaveBeenCalledWith('fr');
    await act(async () => root.render(<ExplorationMap items={[{ ...items[0], title: "Publication actualisée" }]} country="" onReset={() => {}} selected="fr" onSelect={select} />));
    resize();
    expect(mapSpy).toHaveBeenCalledTimes(1);
    expect(map().getZoom()).toBe(7);
    // Leaflet rounds the pixel origin when invalidating its size.
    expect(map().project(map().getCenter()).distanceTo(map().project(center))).toBeLessThan(1);
    expect(markers()).toHaveLength(1);
    expect(markers()[0].getAttribute('aria-pressed')).toBe('true');
    expect(markers()[0].textContent).toContain('Publication actualisée');
  });

  it('splits a nearby cluster when clicked', async () => {
    await act(async () => root.render(<ExplorationMap items={items} country="" onReset={() => {}} selected="" onSelect={() => {}} />));
    expect(host.querySelector('.ex-country-cluster')).not.toBeNull();
    await act(async () => (host.querySelector('.ex-country-cluster') as HTMLElement).click());
    expect(map().getZoom()).toBeGreaterThan(2);
    expect(markers()).toHaveLength(2);
  });

  it('counts individual publications in one country and separates them by zoom 8', async () => {
    const select = vi.fn();
    const publications = Array.from({ length: 23 }, (_, n) => ({ id: `fr-${n}`, title: `Publication ${n}`, countries: ['France'], severity: 'low' }));
    await act(async () => root.render(<ExplorationMap items={publications} country="" onReset={() => {}} selected="" onSelect={select} />));
    expect(host.querySelector('.ex-country-cluster')!.textContent).toContain('23');
    map().setView([46, 2], 8, { animate: false });
    expect(host.querySelector('.ex-country-cluster')).toBeNull();
    expect(markers()).toHaveLength(23);
    const positions = publicationPoints(publications, '').map(item => item.point.join(','));
    expect(new Set(positions).size).toBe(23);
    for (const element of markers()) await act(async () => element.click());
    expect(new Set(select.mock.calls.map(([id]) => id)).size).toBe(23);
  });

  it('opens a map publication outside the feed page without refiltering or resetting the map', async () => {
    const result = { mapItems: items, countries: [], countryOptions: ['France', 'Germany'], items: [], total: 2, unknown: 0, nextCursor: null } as unknown as ExplorationResult;
    const event = { ...items[0], summary: 'Résumé', description: null, category: 'attack', tags: ['gdelt'], cves: [], sectors: [], organizations: [], publishedAt: '2026-09-11', createdAt: '2026-09-11' } as unknown as CyberEvent;
    let resolveEvent!: (event: CyberEvent) => void;
    fetchExploration.mockResolvedValue(result);
    fetchEvent.mockImplementation(() => new Promise(resolve => { resolveEvent = resolve; }));
    await act(async () => root.render(<MemoryRouter initialEntries={['/exploration']}><ExplorationPage /></MemoryRouter>));
    await act(async () => { await import('./ExplorationMap'); });
    map().setView([48, 4], 7, { animate: false });
    expect(host.querySelector<HTMLElement>('#exploration-feed')!.hidden).toBe(true);
    await act(async () => markers().find(e => e.getAttribute('aria-label')?.startsWith('Publication France'))!.click());
    expect(host.querySelector<HTMLElement>('#exploration-feed')!.hidden).toBe(false);
    expect(fetchEvent.mock.calls[0][0]).toBe('fr');
    expect(fetchExploration).toHaveBeenCalledTimes(1);
    expect(markers()).toHaveLength(2);
    expect(host.querySelector('#exploration-feed')!.textContent).toContain('Chargement de la publication');
    await act(async () => resolveEvent(event));
    expect(host.querySelector('[aria-label="Détail de la publication"]')!.textContent).toContain('Publication France');
    expect(mapSpy).toHaveBeenCalledTimes(1);
    expect(map().getZoom()).toBe(7);
    expect(markers()).toHaveLength(2);
  });
});
