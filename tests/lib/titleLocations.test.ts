import { afterEach, describe, expect, it, vi } from 'vitest';
import { categorizeWithDeepseek, locateTitleWithDeepseek } from '../../src/lib/ai/deepseekClient';
import { resolveTitleLocations } from '../../src/lib/geo/resolveLocation';

const candidate = { place: 'Lyon', countryCode: 'FR', precision: 'city', role: 'affected', confidence: 'high', evidence: 'hôpital à Lyon' };
afterEach(() => vi.unstubAllGlobals());
describe('title locations', () => {
  it('resolves Lyon from the gazetteer and retains exact evidence', () => {
    const result = resolveTitleLocations('Cyberattaque contre un hôpital à Lyon', { locations: [candidate] });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ country: 'France', place: 'Lyon', precision: 'city', evidence: candidate.evidence, reference: 'geonames:2996944' });
    expect(result[0]!.latitude).toBeCloseTo(45.74906, 3);
  });
  it('resolves a French victim to country precision only', () => {
    const result = resolveTitleLocations('Une entreprise française piratée', { locations: [{ ...candidate, precision: 'country', place: 'France', evidence: 'entreprise française' }] });
    expect(result[0]).toMatchObject({ country: 'France', precision: 'country', reference: 'world-countries:FR' });
  });
  it.each([
    ['Vulnérabilité dans Windows', candidate],
    ['Cyberattaque contre un hôpital à Lyon', { ...candidate, countryCode: 'XX' }],
    ['Cyberattaque contre un hôpital à Lyon', { ...candidate, confidence: 'low' }],
    ['Des hackers russes attaquent un hôpital', { ...candidate, place: 'Russia', countryCode: 'RU', precision: 'country', role: 'attacker', evidence: 'hackers russes' }],
    ['CERT-FR publie un avis', { ...candidate, place: 'France', precision: 'country', evidence: 'CERT-FR' }],
    ['Incident à Springfield', { ...candidate, place: 'Springfield', countryCode: 'US', evidence: 'Springfield' }],
  ])('abstains for unsupported or ambiguous evidence: %s', (title, proposal) => {
    expect(resolveTitleLocations(title, { locations: [proposal] })).toEqual([]);
  });
  it('calls the new model using only the title and rejects malformed output', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ locations: [candidate] }) } }] })));
    vi.stubGlobal('fetch', fetch);
    const result = await locateTitleWithDeepseek('Cyberattaque contre un hôpital à Lyon', 'test-key');
    expect(result).toHaveLength(1);
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(body.model).toBe('deepseek-flash');
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(JSON.parse(body.messages[1].content)).toEqual({ title: 'Cyberattaque contre un hôpital à Lyon' });
    fetch.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] })));
    await expect(locateTitleWithDeepseek('Titre', 'test-key')).rejects.toThrow('Invalid location');
  });
});

it('accepts only supported content categories with a justification', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ category: 'data_breach', reasoning: 'Le titre rapporte une exposition de donnees' }) } }] })));
  vi.stubGlobal('fetch', fetch);
  expect(await categorizeWithDeepseek('Fuite de donnees', '', 'test-key')).toMatchObject({ category: 'data_breach' });
  fetch.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{"category":"critical","reasoning":"x"}' } }] })));
  await expect(categorizeWithDeepseek('Titre', '', 'test-key')).rejects.toThrow('Invalid category');
});
