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
    await act(async () => root.render(<ExplorationMap items={items} country="" onGroupSelect={select} onReset={() => {}} selected="" onSelect={select} />));
    expect(map().getZoom()).toBe(3);
    map().setView([48, 4], 7, { animate: false });
    const center = map().getCenter();
    const france = markers().find(e => e.getAttribute('aria-label')?.startsWith('Publication France'))!;
    expect(france.hasAttribute('title')).toBe(false);
    expect(france.querySelectorAll('.ex-country-label')).toHaveLength(1);
    await act(async () => france.click());
    expect(france.querySelector<HTMLElement>('.ex-country-label')!.hidden).toBe(true);
    expect(select).toHaveBeenCalledWith('fr');
    await act(async () => root.render(<ExplorationMap items={[{ ...items[0], title: "Publication actualisée" }]} country="" onGroupSelect={select} onReset={() => {}} selected="fr" onSelect={select} />));
    resize();
    expect(mapSpy).toHaveBeenCalledTimes(1);
    expect(map().getZoom()).toBe(7);
    // Leaflet rounds the pixel origin when invalidating its size.
    expect(map().project(map().getCenter()).distanceTo(map().project(center))).toBeLessThan(1);
    expect(markers()).toHaveLength(1);
    expect(markers()[0].getAttribute('aria-pressed')).toBe('true');
    expect(markers()[0].hasAttribute('title')).toBe(false);
    expect(markers()[0].querySelector<HTMLElement>('.ex-country-label')!.hidden).toBe(true);
    expect(markers()[0].textContent).toContain('Publication actualisée');
  });

  it.each([20, 21])('opens up to 20 publications in the feed and zooms larger groups (%i)', async (count) => {
    const select = vi.fn();
    const publications = Array.from({ length: count }, (_, n) => ({ ...items[0], id: `fr-${n}` }));
    await act(async () => root.render(<ExplorationMap items={publications} country="" onGroupSelect={select} onReset={() => {}} selected="" onSelect={() => {}} />));
    const center = map().getCenter();
    await act(async () => (host.querySelector('.ex-country-cluster') as HTMLElement).click());
    if (count === 20) {
      expect(select).toHaveBeenCalledWith(expect.arrayContaining(publications.map(item => item.id)));
      expect(map().getZoom()).toBe(3);
      expect(map().getCenter()).toEqual(center);
    } else {
      expect(select).not.toHaveBeenCalled();
      expect(map().getZoom()).toBeGreaterThan(3);
    }
  });

  it('splits 63 Russia publications on zoom without spider legs or a popup', async () => {
    const select = vi.fn();
    const publications = Array.from({ length: 63 }, (_, n) => ({ id: `ru-${n}`, title: `Publication ${n}`, countries: ['Russia'], severity: 'low' }));
    const points = publicationPoints(publications, '');
    expect(points).toHaveLength(63);
    expect(new Set(points.map(item => item.point.join(','))).size).toBe(63);
    expect(publicationPoints([...publications].reverse(), '')).toEqual(points);
    await act(async () => root.render(<ExplorationMap items={publications} country="" onGroupSelect={select} onReset={() => {}} selected="" onSelect={select} />));
    map().setView(points[0].point, 3, { animate: false });
    expect(host.querySelector('.ex-country-cluster')!.textContent).toContain('63');
    map().setView(points[0].point, 8, { animate: false });
    expect(host.querySelectorAll('.ex-leaflet-marker').length).toBeGreaterThan(1);
    map().setView(points[0].point, 12, { animate: false });
    expect(host.querySelector('.ex-country-cluster')).toBeNull();
    expect(host.querySelector('.leaflet-markercluster-spider-leg')).toBeNull();
    expect(host.querySelector('.leaflet-popup')).toBeNull();
  });

  it('opens all group publications in the right feed even outside the loaded page', async () => {
    const publications = [items[0], { ...items[0], id: 'fr2', title: 'Second article' }];
    fetchExploration.mockResolvedValue({ mapItems: publications, countries: [], countryOptions: [], items: [], total: 2, unknown: 0, nextCursor: 'next' });
    await act(async () => root.render(<MemoryRouter initialEntries={['/exploration']}><ExplorationPage /></MemoryRouter>));
    await act(async () => { await import('./ExplorationMap'); });
    await act(async () => (host.querySelector('.ex-country-cluster') as HTMLElement).click());
    const feed = host.querySelector<HTMLElement>('#exploration-feed')!;
    expect(feed.hidden).toBe(false);
    expect(feed.querySelectorAll('.ex-event')).toHaveLength(2);
    expect(feed.textContent).toContain('Second article');
    expect(feed.querySelector('.ex-load-more')).toBeNull();
    expect(host.querySelector('.leaflet-popup')).toBeNull();
    expect(fetchExploration).toHaveBeenCalledTimes(1);
    expect(map().getZoom()).toBe(3);
  });

  it('places the period controls inside the feed and ignores obsolete location URLs', async () => {
    fetchExploration.mockResolvedValue({ mapItems: [], countries: [], countryOptions: [], items: [], total: 0, unknown: 0, nextCursor: null });
    await act(async () => root.render(<MemoryRouter initialEntries={['/exploration?period=24h&location=unknown']}><ExplorationPage /></MemoryRouter>));
    expect(host.querySelector('#exploration-feed [aria-label="Période"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Couverture géographique"]')).toBeNull();
    expect(fetchExploration.mock.calls[0][0].has('location')).toBe(false);
  });

  it('uses resolved city coordinates instead of the country centroid', () => {
    const location = { country: 'France', countryCode: 'FR', place: 'Lyon', precision: 'city' as const, latitude: 45.74906, longitude: 4.84789, evidence: 'Lyon', method: 'title_deepseek', reference: 'geonames:2996944' };
    expect(publicationPoints([{ ...items[0], locations: [location] }], '')[0].point).toEqual([location.latitude, location.longitude]);
  });

  it('opens only the popup for a map publication without opening the feed or resetting the map', async () => {
    const result = { mapItems: items, countries: [], countryOptions: ['France', 'Germany'], items: [], total: 2, unknown: 0, nextCursor: null } as unknown as ExplorationResult;
    const event = { ...items[0], publications: [{ source: 'GDELT', url: 'https://news.example/article', title: items[0].title, publishedAt: '2026-09-11' }], summary: 'Résumé', description: null, category: 'attack', tags: ['gdelt'], cves: [], sectors: [], organizations: [], publishedAt: '2026-09-11', createdAt: '2026-09-11' } as unknown as CyberEvent;
    let resolveEvent!: (event: CyberEvent) => void;
    fetchExploration.mockResolvedValue(result);
    fetchEvent.mockImplementation(() => new Promise(resolve => { resolveEvent = resolve; }));
    await act(async () => root.render(<MemoryRouter initialEntries={['/exploration']}><ExplorationPage /></MemoryRouter>));
    await act(async () => { await import('./ExplorationMap'); });
    expect(map().getZoom()).toBe(3);
    map().setView([48, 4], 7, { animate: false });
    expect(host.querySelector<HTMLElement>('#exploration-feed')!.hidden).toBe(true);
    await act(async () => markers().find(e => e.getAttribute('aria-label')?.startsWith('Publication France'))!.click());
    expect(host.querySelector<HTMLElement>('#exploration-feed')!.hidden).toBe(true);
    expect(fetchEvent.mock.calls[0][0]).toBe('fr');
    expect(fetchExploration).toHaveBeenCalledTimes(1);
    expect(markers()).toHaveLength(2);
    expect(host.querySelector('.ex-map-error')!.textContent).toContain('Chargement de la publication');
    await act(async () => resolveEvent(event));
    expect(host.querySelector('[aria-label="Détail de la publication"]')).toBeNull();
    expect(host.querySelector<HTMLElement>('#exploration-feed')!.hidden).toBe(true);
    expect(host.querySelector('.ex-map-popup-open')).not.toBeNull();
    const popup = host.querySelector('.ex-publication-popup')!;
    expect(popup.textContent).toContain('Publication France');
    expect(popup.textContent).toContain('news.example');
    expect(popup.textContent).toContain('11/09/2026');
    expect(popup.querySelector('h3 a')?.getAttribute('href')).toBe('https://news.example/article');
    expect(popup.querySelector('h3 a')?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(mapSpy).toHaveBeenCalledTimes(1);
    expect(map().getZoom()).toBe(7);
    expect(markers()).toHaveLength(2);
  });
});
