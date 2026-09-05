import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeVulnerability } from '../../src/collectors/cisaKev/normalize';
import type { CisaKevCatalog } from '../../src/collectors/cisaKev/normalize';

/**
 * Fixture construite a partir du vrai catalogue CISA KEV, colle par
 * l'utilisateur depuis son navigateur (cf. §34 -- meme raison que pour
 * CERT-FR : mon bac a sable n'a pas acces a www.cisa.gov, l'utilisateur a
 * donc fourni le vrai JSON). Deux entrees completes et reelles :
 * CVE-2026-85046 (Google Chromium V8) et CVE-2026-59822 (BerriAI LiteLLM).
 */
const FIXTURES_DIR = join(__dirname, 'cisa-kev-fixtures');

function loadCatalog(): CisaKevCatalog {
  const raw = readFileSync(join(FIXTURES_DIR, 'known-exploited-vulnerabilities-real.json'), 'utf-8');
  return JSON.parse(raw) as CisaKevCatalog;
}

describe('normalizeVulnerability -- CVE-2026-85046 (Google Chromium V8, vraie entree)', () => {
  it('normalise correctement en CollectorItem', () => {
    const catalog = loadCatalog();
    const vuln = catalog.vulnerabilities.find((v) => v.cveID === 'CVE-2026-85046');
    expect(vuln).toBeDefined();

    const result = normalizeVulnerability(vuln!);

    expect(result.externalId).toBe('CVE-2026-85046');
    expect(result.url).toBe('https://nvd.nist.gov/vuln/detail/CVE-2026-85046');
    expect(result.title).toBe('CVE-2026-85046 - Google Chromium V8 Type Confusion Vulnerability');
    expect(result.publishedAt?.toISOString()).toBe('2026-09-04T00:00:00.000Z');
    expect(result.contentExcerpt).toContain('type confusion vulnerability');
    expect(result.contentExcerpt).not.toContain('BOD 26-04');
    expect(result.raw).toBe(vuln);
  });
});

describe('normalizeVulnerability -- CVE-2026-59822 (BerriAI LiteLLM, vraie entree)', () => {
  it('normalise correctement en CollectorItem', () => {
    const catalog = loadCatalog();
    const vuln = catalog.vulnerabilities.find((v) => v.cveID === 'CVE-2026-59822');
    expect(vuln).toBeDefined();

    const result = normalizeVulnerability(vuln!);

    expect(result.externalId).toBe('CVE-2026-59822');
    expect(result.url).toBe('https://nvd.nist.gov/vuln/detail/CVE-2026-59822');
    expect(result.title).toBe('CVE-2026-59822 - BerriAI LiteLLM Improper Authentication Vulnerability');
    expect(result.publishedAt?.toISOString()).toBe('2026-09-02T00:00:00.000Z');
    expect(result.contentExcerpt).toContain('improper authentication vulnerability');
  });
});

describe('normalizeVulnerability -- catalogue complet', () => {
  it('normalise les deux vraies entrees du catalogue sans erreur', () => {
    const catalog = loadCatalog();
    expect(catalog.vulnerabilities).toHaveLength(2);

    const items = catalog.vulnerabilities.map((v) => normalizeVulnerability(v));

    for (const item of items) {
      expect(item.title).not.toBe('');
      expect(item.url).toMatch(/^https:\/\/nvd\.nist\.gov\/vuln\/detail\/CVE-\d{4}-\d+$/);
      expect(item.publishedAt).toBeInstanceOf(Date);
      expect(item.contentExcerpt.length).toBeGreaterThan(0);
    }
  });
});
