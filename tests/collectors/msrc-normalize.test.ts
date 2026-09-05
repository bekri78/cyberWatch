import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';
import { normalizeVulnerability } from '../../src/collectors/msrc/normalize';
import type { MsrcVulnerability } from '../../src/collectors/msrc/normalize';

/**
 * Fixture reelle : les deux blocs <vuln:Vulnerability> ont ete colles
 * textuellement par l'utilisateur depuis le vrai document CVRF MSRC
 * 2026-Feb (https://api.msrc.microsoft.com/cvrf/v3.0/cvrf/2026-Feb), mon
 * bac a sable etant bloque sur api.msrc.microsoft.com (meme situation que
 * CERT-FR/CISA KEV). L'enveloppe <cvrf:cvrfdoc> autour a ete reconstruite
 * a partir des champs reels observes via une lecture anterieure du meme
 * document (DocumentTitle/ID), pour obtenir un fichier XML valide et
 * autonome -- les deux Vulnerability sont, eux, une copie exacte.
 */
const FIXTURES_DIR = join(__dirname, 'msrc-fixtures');

function loadVulnerabilities(): MsrcVulnerability[] {
  const xml = readFileSync(join(FIXTURES_DIR, 'cvrf-sample-real.xml'), 'utf-8');
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const doc = parser.parse(xml);
  const vulns = doc['cvrf:cvrfdoc']['vuln:Vulnerability'];
  return Array.isArray(vulns) ? vulns : [vulns];
}

describe('normalizeVulnerability -- CVE-2025-61143 (libtiff NULL pointer dereference, vraie entree)', () => {
  it('normalise en CollectorItem avec le score CVSS le plus eleve (5.5, identique sur les 2 produits)', () => {
    const vulns = loadVulnerabilities();
    const vuln = vulns.find((v) => v['vuln:CVE'] === 'CVE-2025-61143');
    expect(vuln).toBeDefined();

    const result = normalizeVulnerability(vuln!);

    expect(result).not.toBeNull();
    expect(result!.externalId).toBe('CVE-2025-61143');
    expect(result!.url).toBe('https://msrc.microsoft.com/update-guide/vulnerability/CVE-2025-61143');
    expect(result!.title).toBe(
      'CVE-2025-61143 - libtiff up to v4.7.1 was discovered to contain a NULL pointer dereference via the component libtiff/tif_open.c.',
    );
    // La note "Description" est une balise auto-fermante (vide) sur cette
    // vraie entree -- on retombe donc sur le titre.
    expect(result!.contentExcerpt).toBe(
      'CVSS 5.5 — libtiff up to v4.7.1 was discovered to contain a NULL pointer dereference via the component libtiff/tif_open.c.',
    );
    // La 1ere revision listee dans le XML est 2.0 (14:36:13), la 2e est 1.0
    // (01:01:32) -- verifie qu'on prend bien le minimum, pas le premier
    // element du tableau.
    expect(result!.publishedAt?.toISOString()).toBe('2026-02-26T01:01:32.000Z');
    expect(result!.raw).toBe(vuln);
  });
});

describe('normalizeVulnerability -- CVE-2025-61144 (libtiff stack overflow, critique, vraie entree)', () => {
  it('normalise avec un score CVSS critique (9.8) et l\'ordre de revision inverse', () => {
    const vulns = loadVulnerabilities();
    const vuln = vulns.find((v) => v['vuln:CVE'] === 'CVE-2025-61144');
    expect(vuln).toBeDefined();

    const result = normalizeVulnerability(vuln!);

    expect(result).not.toBeNull();
    expect(result!.externalId).toBe('CVE-2025-61144');
    expect(result!.contentExcerpt).toContain('CVSS 9.8');
    expect(result!.contentExcerpt).toContain('stack overflow');
    // Ici la 1ere revision listee est 1.0 (01:01:40) -- toujours le minimum.
    expect(result!.publishedAt?.toISOString()).toBe('2026-02-26T01:01:40.000Z');
  });
});

describe('normalizeVulnerability -- entree sans CVE', () => {
  it('renvoie null plutot que de fabriquer un identifiant arbitraire', () => {
    const result = normalizeVulnerability({ 'vuln:Title': 'Une entree sans CVE assigne' });
    expect(result).toBeNull();
  });
});
