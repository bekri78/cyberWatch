// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import L from 'leaflet';
import ExplorationMap from './ExplorationMap';
import ExplorationPage from '../pages/ExplorationPage';
import type { ExplorationResult } from '../api/types';

const { fetchExploration } = vi.hoisted(() => ({ fetchExploration: vi.fn() }));
vi.mock('../api/client', () => ({ fetchExploration, MAP_TILE_URL: '/tiles/{z}/{x}/{y}.png' }));

let root: Root;
let host: HTMLDivElement;
let resize: () => void;
let mapSpy: MockInstance<typeof L.map>;
const countries = [{ country: 'France', count: 23, high: 2 }, { country: 'Germany', count: 89, high: 3 }];

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
    await act(async () => root.render(<ExplorationMap countries={countries} selected="" onSelect={select} />));
    map().setView([48, 4], 7, { animate: false });
    const center = map().getCenter();
    const france = markers().find(e => e.getAttribute('aria-label')?.startsWith('France'))!;
    await act(async () => france.click());
    expect(select).toHaveBeenCalledWith('France');
    await act(async () => root.render(<ExplorationMap countries={[{ ...countries[0], count: 24 }]} selected="France" onSelect={select} />));
    resize();
    expect(mapSpy).toHaveBeenCalledTimes(1);
    expect(map().getZoom()).toBe(7);
    // Leaflet rounds the pixel origin when invalidating its size.
    expect(map().project(map().getCenter()).distanceTo(map().project(center))).toBeLessThan(1);
    expect(markers()).toHaveLength(1);
    expect(markers()[0].getAttribute('aria-pressed')).toBe('true');
    expect(markers()[0].textContent).toContain('24');
  });

  it('splits a nearby cluster when clicked', async () => {
    await act(async () => root.render(<ExplorationMap countries={countries} selected="" onSelect={() => {}} />));
    expect(host.querySelector('.ex-country-cluster')).not.toBeNull();
    await act(async () => (host.querySelector('.ex-country-cluster') as HTMLElement).click());
    expect(map().getZoom()).toBeGreaterThan(2);
    expect(markers()).toHaveLength(2);
  });

  it('spiderfies identical coordinates and lets each marker open its own feed', async () => {
    const select = vi.fn();
    const duplicates = ['USA', 'United States'].map(country => ({ country, count: 1, high: 0 }));
    await act(async () => root.render(<ExplorationMap countries={duplicates} selected="" onSelect={select} />));
    map().setView([38, -97], 20, { animate: false });
    await act(async () => (host.querySelector('.ex-country-cluster') as HTMLElement).click());
    const expanded = markers();
    expect(expanded).toHaveLength(2);
    expect(expanded[0].style.transform || expanded[0].style.left).not.toBe(expanded[1].style.transform || expanded[1].style.left);
    for (const element of expanded) await act(async () => element.click());
    expect(select.mock.calls.map(([country]) => country).sort()).toEqual(['USA', 'United States']);
  });

  it('opens the country feed immediately and preserves markers while the request is pending', async () => {
    const result = { countries, countryOptions: ['France', 'Germany'], items: [], total: 0, unknown: 0, nextCursor: null } as unknown as ExplorationResult;
    let resolveCountry!: (result: ExplorationResult) => void;
    fetchExploration.mockResolvedValueOnce(result).mockImplementationOnce(() => new Promise(resolve => { resolveCountry = resolve; }));
    await act(async () => root.render(<MemoryRouter initialEntries={['/exploration']}><ExplorationPage /></MemoryRouter>));
    await act(async () => { await import('./ExplorationMap'); });
    map().setView([48, 4], 7, { animate: false });
    expect(host.querySelector<HTMLElement>('#exploration-feed')!.hidden).toBe(true);
    await act(async () => markers().find(e => e.getAttribute('aria-label')?.startsWith('France'))!.click());
    expect(host.querySelector<HTMLElement>('#exploration-feed')!.hidden).toBe(false);
    expect(fetchExploration.mock.calls.at(-1)![0].get('country')).toBe('France');
    expect(markers()).toHaveLength(2);
    expect(host.querySelector('#exploration-feed')!.textContent).toContain('Chargement de la veille');
    await act(async () => resolveCountry({ ...result, countries: [countries[0]] }));
    expect(mapSpy).toHaveBeenCalledTimes(1);
    expect(map().getZoom()).toBe(7);
    expect(markers()).toHaveLength(1);
  });
});
