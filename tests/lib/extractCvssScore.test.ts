import { describe, expect, it } from 'vitest';
import { extractCvssScore } from '../../src/lib/text/extractCvssScore';

describe('extractCvssScore', () => {
  it('extrait un score CVSS ecrit au format "CVSS X.X"', () => {
    expect(extractCvssScore('CVSS 9.8 — libtiff contains a stack overflow.')).toBe(9.8);
  });

  it('extrait un score CVSS entier sans decimale', () => {
    expect(extractCvssScore('CVSS 7 — some vulnerability.')).toBe(7);
  });

  it("ne confond pas un vecteur CVSS brut (\"CVSS:3.1/...\") avec un score", () => {
    expect(extractCvssScore('Vector: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')).toBeNull();
  });

  it("renvoie null si aucune mention CVSS n'est presente", () => {
    expect(extractCvssScore("Une vulnerabilite a ete decouverte dans SPIP.")).toBeNull();
  });

  it('est insensible a la casse', () => {
    expect(extractCvssScore('cvss 4.0 — description')).toBe(4);
  });
});
