import { describe, expect, it } from 'vitest';
import { extractCves } from '../../src/lib/text/extractCves';

describe('extractCves', () => {
  it('extrait un CVE unique', () => {
    expect(extractCves('La vulnerabilite CVE-2026-83548 permet une SSRF.')).toEqual(['CVE-2026-83548']);
  });

  // Extrait reel de CERTFR-2026-AVI-1103 (produits SonicWall).
  it('extrait plusieurs CVE dans un extrait reel CERT-FR', () => {
    const text =
      "L'editeur indique que les vulnerabilites CVE-2026-83548 et CVE-2026-83549 sont exploitees.";
    expect(extractCves(text)).toEqual(['CVE-2026-83548', 'CVE-2026-83549']);
  });

  it('deduplique les occurrences repetees', () => {
    expect(extractCves('CVE-2024-6387 ... encore CVE-2024-6387 ici')).toEqual(['CVE-2024-6387']);
  });

  it('normalise la casse en majuscules', () => {
    expect(extractCves('cve-2024-6387')).toEqual(['CVE-2024-6387']);
  });

  it('renvoie un tableau vide en absence de CVE', () => {
    expect(extractCves("Un probleme de securite non specifie par l'editeur.")).toEqual([]);
  });
});
