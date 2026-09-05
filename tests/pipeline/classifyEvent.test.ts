import { describe, expect, it } from 'vitest';
import { classifyEvent } from '../../src/pipeline/classifyEvent';

// Les extraits ci-dessous sont copies textuellement des vraies entrees
// CERT-FR fournies par l'utilisateur (cf. tests/collectors/certfr-fixtures)
// -- on verifie que le classifieur deterministe se comporte correctement
// face au vrai texte produit par la source, pas face a des exemples
// inventes pour l'occasion.

describe('classifyEvent -- avis CERT-FR (CERTFR-2026-AVI-1103, produits SonicWall)', () => {
  it('categorise "vulnerability", severite "medium" (CVE presents, pas d\'exploitation active mentionnee)', () => {
    const result = classifyEvent({
      sourceName: 'certfr',
      url: 'https://www.cert.ssi.gouv.fr/avis/CERTFR-2026-AVI-1103/',
      title: 'Multiples vulnérabilités dans les produits SonicWall (02 septembre 2026)',
      contentExcerpt:
        "De multiples vulnérabilités ont été découvertes dans les produits SonicWall. Elles permettent à un attaquant de provoquer une exécution de code arbitraire à distance et une falsification de requêtes côté serveur (SSRF). L'éditeur indique que les vulnérabilités CVE-2026-83548 et CVE-2026-83549...",
    });

    expect(result.category).toBe('vulnerability');
    expect(result.severity).toBe('medium');
    expect(result.cves).toEqual(['CVE-2026-83548', 'CVE-2026-83549']);
    expect(result.confidence).toBe('low');
    expect(result.tags).toEqual(['certfr', 'vulnerability']);
  });
});

describe('classifyEvent -- avis CERT-FR (CERTFR-2026-AVI-1063, SPIP)', () => {
  it('severite "critical" quand le texte reel indique une exploitation active, meme sans CVE explicite', () => {
    const result = classifyEvent({
      sourceName: 'certfr',
      url: 'https://www.cert.ssi.gouv.fr/avis/CERTFR-2026-AVI-1063/',
      title: 'Vulnérabilité dans SPIP (21 août 2026)',
      contentExcerpt:
        "Une vulnérabilité a été découverte dans SPIP. Elle permet à un attaquant de provoquer une exécution de code arbitraire à distance. L'éditeur indique que cette vulnérabilité est activement exploitée.",
    });

    expect(result.category).toBe('vulnerability');
    expect(result.severity).toBe('critical');
    expect(result.cves).toEqual([]);
  });
});

describe('classifyEvent -- alerte CERT-FR (CERTFR-2026-ALE-006, Sonicwall SMA)', () => {
  it('categorise "alert", severite "high" par defaut (CVE present, pas d\'exploitation active mentionnee)', () => {
    const result = classifyEvent({
      sourceName: 'certfr',
      url: 'https://www.cert.ssi.gouv.fr/alerte/CERTFR-2026-ALE-006/',
      title: 'Multiples vulnérabilités dans Sonicwall Secure Mobile Access (15 juillet 2026)',
      contentExcerpt:
        "Le 14 juillet 2026, Sonicwall a publié un avis de sécurité concernant deux vulnérabilités affectant les Secure Mobile Access (SMA) 1000. La vulnérabilité critique CVE-2026-15409 permet une falsification de requêtes côté serveur (SSRF) de la part d'un attaquant non authentifié. La vulnérabilité...",
    });

    expect(result.category).toBe('alert');
    expect(result.severity).toBe('high');
    expect(result.cves).toEqual(['CVE-2026-15409']);
  });
});

describe('classifyEvent -- alerte CERT-FR (CERTFR-2026-ALE-002, Cisco Catalyst SD-WAN)', () => {
  it("l'exploitation active l'emporte sur la severite par defaut d'une alerte", () => {
    const result = classifyEvent({
      sourceName: 'certfr',
      url: 'https://www.cert.ssi.gouv.fr/alerte/CERTFR-2026-ALE-002/',
      title: 'Vulnérabilité dans Cisco Catalyst SD-WAN (25 février 2026)',
      contentExcerpt:
        "Une vulnérabilité a été découverte dans Cisco Catalyst SD-WAN. Elle permet à un attaquant de provoquer un contournement de la politique de sécurité. Cisco indique que la vulnérabilité CVE-2026-20127 est activement exploitée.",
    });

    expect(result.category).toBe('alert');
    expect(result.severity).toBe('critical');
    expect(result.cves).toEqual(['CVE-2026-20127']);
  });
});

describe('classifyEvent -- cti CERT-FR (CERTFR-2026-CTI-004, campagne Turla)', () => {
  it('categorise "threat_intel", severite "low" par defaut (pas de CVE, pas de formule "activement exploitee")', () => {
    const result = classifyEvent({
      sourceName: 'certfr',
      url: 'https://www.cert.ssi.gouv.fr/cti/CERTFR-2026-CTI-004/',
      title: "Ciblage et compromission d'entités françaises au moyen du mode opératoire d'attaque Turla (13 juillet 2026)",
      contentExcerpt:
        "Les membres du Centre de Coordination des Crises Cyber (C4) ont observé le ciblage et la compromission d'entités françaises au moyen du mode opératoire d'attaque (MOA) Turla, opéré par le 16ème Centre du service fédéral de sécurité de la fédération de Russie (FSB).",
    });

    expect(result.category).toBe('threat_intel');
    expect(result.severity).toBe('low');
    expect(result.cves).toEqual([]);
    expect(result.tags).toEqual(['certfr', 'threat_intel']);
  });
});

describe('classifyEvent -- CISA KEV (CVE-2026-85046, Google Chromium V8, vraie entree)', () => {
  it('categorise "vulnerability", severite "critical" imposee (appartenance au catalogue KEV = exploitation active confirmee)', () => {
    const result = classifyEvent({
      sourceName: 'cisa_kev',
      url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-85046',
      title: 'CVE-2026-85046 - Google Chromium V8 Type Confusion Vulnerability',
      contentExcerpt:
        'Google Chromium V8 contains a type confusion vulnerability that allows a remote attacker to execute arbitrary code inside the sandbox via a crafted HTML page.',
    });

    expect(result.category).toBe('vulnerability');
    expect(result.severity).toBe('critical');
    expect(result.cves).toEqual(['CVE-2026-85046']);
    expect(result.confidence).toBe('low');
    expect(result.tags).toEqual(['cisa_kev', 'vulnerability']);
  });
});

describe('classifyEvent -- CISA KEV (CVE-2026-59822, BerriAI LiteLLM, vraie entree)', () => {
  it('severite "critical" meme sans mot-cle explicite d\'exploitation dans le texte (le catalogue KEV suffit)', () => {
    const result = classifyEvent({
      sourceName: 'cisa_kev',
      url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-59822',
      title: 'CVE-2026-59822 - BerriAI LiteLLM Improper Authentication Vulnerability',
      contentExcerpt:
        'BerriAI LiteLLM contains an improper authentication vulnerability in the MCP Streamable HTTP endpoint that could allow an unauthenticated attacker to establish an authenticated MCP session using an arbitrary Bearer token.',
    });

    expect(result.category).toBe('vulnerability');
    expect(result.severity).toBe('critical');
    expect(result.cves).toEqual(['CVE-2026-59822']);
  });
});

describe('classifyEvent -- MSRC (CVE-2025-61144, libtiff, score CVSS 9.8, vraie entree)', () => {
  it('categorise "vulnerability", severite "critical" derivee de la bande CVSS (>= 9.0)', () => {
    const result = classifyEvent({
      sourceName: 'microsoft_msrc',
      url: 'https://msrc.microsoft.com/update-guide/vulnerability/CVE-2025-61144',
      title: 'CVE-2025-61144 - libtiff up to v4.7.1 was discovered to contain a stack overflow via the readSeparateStripsIntoBuffer function.',
      contentExcerpt:
        'CVSS 9.8 — libtiff up to v4.7.1 was discovered to contain a stack overflow via the readSeparateStripsIntoBuffer function.',
    });

    expect(result.category).toBe('vulnerability');
    expect(result.severity).toBe('critical');
    expect(result.cves).toEqual(['CVE-2025-61144']);
    expect(result.confidence).toBe('low');
    expect(result.tags).toEqual(['microsoft_msrc', 'vulnerability']);
  });
});

describe('classifyEvent -- MSRC (CVE-2025-61143, libtiff, score CVSS 5.5, vraie entree)', () => {
  it('severite "medium" derivee de la bande CVSS (4.0-6.9)', () => {
    const result = classifyEvent({
      sourceName: 'microsoft_msrc',
      url: 'https://msrc.microsoft.com/update-guide/vulnerability/CVE-2025-61143',
      title: 'CVE-2025-61143 - libtiff up to v4.7.1 was discovered to contain a NULL pointer dereference via the component libtiff/tif_open.c.',
      contentExcerpt:
        'CVSS 5.5 — libtiff up to v4.7.1 was discovered to contain a NULL pointer dereference via the component libtiff/tif_open.c.',
    });

    expect(result.category).toBe('vulnerability');
    expect(result.severity).toBe('medium');
  });
});

describe('classifyEvent -- MSRC sans score CVSS exploitable', () => {
  it('retombe sur "low" plutot que de deviner (pas de detection de phrase pour MSRC)', () => {
    const result = classifyEvent({
      sourceName: 'microsoft_msrc',
      url: 'https://msrc.microsoft.com/update-guide/vulnerability/CVE-2026-00000',
      title: 'CVE-2026-00000 - Une entree hypothetique sans score CVSS publie',
      contentExcerpt: 'Aucun score CVSS disponible pour cette entree.',
    });

    expect(result.category).toBe('vulnerability');
    expect(result.severity).toBe('low');
  });
});

describe('classifyEvent -- CERT-FR mentionnant "CVSS" dans son propre texte (non-regression)', () => {
  it('ne bascule pas sur la bande CVSS -- la logique MSRC est restreinte a microsoft_msrc', () => {
    const result = classifyEvent({
      sourceName: 'certfr',
      url: 'https://www.cert.ssi.gouv.fr/alerte/CERTFR-2026-ALE-999/',
      title: 'Vulnerabilite critique dans un produit (score CVSS eleve)',
      contentExcerpt: 'Le score CVSS 9.8 associe a cette vulnerabilite en fait une priorite absolue.',
    });

    // Doit suivre la logique CERT-FR habituelle (categorie "alert" -> "high"
    // par defaut), pas la bande CVSS qui aurait donne "critical".
    expect(result.category).toBe('alert');
    expect(result.severity).toBe('high');
  });
});

describe('classifyEvent -- avis CERT-FR industriel (CERTFR-2026-AVI-0714, Siemens, flux scada)', () => {
  it('ajoute le tag "ot" en plus de "certfr"/"vulnerability" quand un editeur industriel est mentionne', () => {
    const result = classifyEvent({
      sourceName: 'certfr',
      url: 'https://www.cert.ssi.gouv.fr/avis/CERTFR-2026-AVI-0714/',
      title: 'Multiples vulnérabilités dans les produits Siemens (09 juin 2026)',
      contentExcerpt:
        'De multiples vulnérabilités ont été découvertes dans les produits Siemens. Elles permettent à un attaquant de provoquer une exécution de code arbitraire à distance, un déni de service à distance et une atteinte à la confidentialité des données.',
    });

    expect(result.category).toBe('vulnerability');
    expect(result.tags).toEqual(['certfr', 'vulnerability', 'ot']);
  });
});

describe('classifyEvent -- avis CERT-FR sans editeur industriel (non-regression)', () => {
  it("n'ajoute pas le tag \"ot\" pour un avis sans editeur OT connu", () => {
    const result = classifyEvent({
      sourceName: 'certfr',
      url: 'https://www.cert.ssi.gouv.fr/avis/CERTFR-2026-AVI-1103/',
      title: 'Multiples vulnérabilités dans les produits SonicWall (02 septembre 2026)',
      contentExcerpt: 'De multiples vulnérabilités ont été découvertes dans les produits SonicWall.',
    });

    expect(result.tags).toEqual(['certfr', 'vulnerability']);
  });
});

describe('classifyEvent -- source inconnue', () => {
  it('retombe sur la categorie "other" et la severite "low" sans planter', () => {
    const result = classifyEvent({
      sourceName: 'bleepingcomputer',
      url: 'https://www.bleepingcomputer.com/news/security/example/',
      title: 'Un titre quelconque',
      contentExcerpt: null,
    });

    expect(result.category).toBe('other');
    expect(result.severity).toBe('low');
    expect(result.tags).toEqual(['bleepingcomputer', 'other']);
  });
});
