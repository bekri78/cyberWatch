import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildContentExcerpt,
  extractCountries,
  extractPageTitle,
  isCyberSignal,
  normalizeGkgLine,
  parseGdeltDate,
  parseThemes,
} from '../../src/collectors/gdelt/normalize';

/**
 * Fixture = 8 vraies lignes extraites d'un vrai fichier GKG 2.1
 * (20260905071500.gkg.csv.zip) telecharge par l'utilisateur depuis
 * http://data.gdeltproject.org/gdeltv2/ et depose tel quel (cf. §34 --
 * meme methode que pour CERT-FR/CISA/MSRC : donnee reelle, jamais generee).
 * 3 lignes non-cyber (bruit ordinaire) + 5 lignes reellement taguees
 * CYBER_ATTACK/WB_2457_CYBER_CRIME par GDELT, dont 4 qui sont en realite la
 * MEME depeche republiee par 4 sites clones differents (meme titre exact,
 * URLs distinctes) -- cf. dedupeByTitle dans gdelt/index.ts.
 */
const FIXTURES_DIR = join(__dirname, 'gdelt-fixtures');

function loadLines(): string[] {
  const raw = readFileSync(join(FIXTURES_DIR, 'gkg-sample-real.csv'), 'utf-8');
  return raw.split('\n').filter((l) => l.trim().length > 0);
}

describe('parseThemes / isCyberSignal', () => {
  it('detecte CYBER_ATTACK sur la vraie ligne philippinetimes.com', () => {
    const line = loadLines().find((l) => l.includes('philippinetimes.com'))!;
    const themes = parseThemes(line.split('\t')[7]);
    expect(themes).toContain('CYBER_ATTACK');
    expect(isCyberSignal(themes)).toBe(true);
  });

  it('detecte WB_2457_CYBER_CRIME sur la vraie ligne thehindu.com (fraude cryptomonnaie)', () => {
    const line = loadLines().find((l) => l.includes('thehindu.com'))!;
    const themes = parseThemes(line.split('\t')[7]);
    expect(themes).toContain('WB_2457_CYBER_CRIME');
    expect(themes).toContain('CYBER_ATTACK');
    expect(isCyberSignal(themes)).toBe(true);
  });

  it("ne detecte rien sur les vraies lignes de bruit ordinaire (pas de theme cyber)", () => {
    const line = loadLines().find((l) => l.includes('newburytoday.co.uk'))!;
    const themes = parseThemes(line.split('\t')[7]);
    expect(isCyberSignal(themes)).toBe(false);
  });
});

describe('extractPageTitle', () => {
  it('extrait le vrai titre OpenAI/Reuters (ligne philippinetimes.com)', () => {
    const line = loadLines().find((l) => l.includes('philippinetimes.com'))!;
    const title = extractPageTitle(line.split('\t')[26]);
    expect(title).toBe('OpenAI agents turned German website into message board  Reuters');
  });

  it('decode correctement une entite HTML hexadecimale reelle (symbole roupie &#x20B9; sur thehindu.com)', () => {
    const line = loadLines().find((l) => l.includes('thehindu.com'))!;
    const title = extractPageTitle(line.split('\t')[26]);
    expect(title).toBe('ED arrests two in ₹40-crore HashPe cryptocurrency fraud');
  });

  it('renvoie null si aucun <PAGE_TITLE> present', () => {
    expect(extractPageTitle('<PAGE_LINKS>https://example.com</PAGE_LINKS>')).toBeNull();
  });
});

describe('parseGdeltDate', () => {
  it('parse le vrai format YYYYMMDDHHMMSS (UTC)', () => {
    expect(parseGdeltDate('20260905071500')?.toISOString()).toBe('2026-09-05T07:15:00.000Z');
  });

  it('renvoie null sur un format invalide', () => {
    expect(parseGdeltDate('pas-une-date')).toBeNull();
  });
});

describe('buildContentExcerpt', () => {
  it('assemble pays, organisations, personnes et themes matches, tronque a 2000 caracteres', () => {
    const excerpt = buildContentExcerpt(['CYBER_ATTACK'], ['cyber crime police'], ['hitesh kumar'], ['India']);
    expect(excerpt).toContain('Pays: India');
    expect(excerpt).toContain('Organisations: cyber crime police');
    expect(excerpt).toContain('Personnes: hitesh kumar');
    expect(excerpt).toContain('Themes GDELT: CYBER_ATTACK');
    expect(excerpt.length).toBeLessThanOrEqual(2000);
  });
});

describe('extractCountries', () => {
  it("extrait le pays d'un bloc pays seul (Type=1, vraie donnee : \"United Kingdom\")", () => {
    expect(extractCountries('1#United Kingdom#UK#UK#54#-4#UK')).toEqual(['United Kingdom']);
  });

  it('extrait le pays (dernier segment) d\'un bloc ville complet (Type=4, vraie donnee : Chennai, Inde)', () => {
    expect(extractCountries('4#Chennai, Tamil Nadu, India#IN#IN25#13.0833#80.2833#-2103041')).toEqual(['India']);
  });

  it('deduplique et combine plusieurs blocs reels (vraie ligne thehindu.com : 3 lieux, 1 seul pays)', () => {
    const v1locations =
      '4#Chennai, Tamil Nadu, India#IN#IN25#13.0833#80.2833#-2103041;' +
      '4#Puducherry, Pondicherry, India#IN#IN22#11.93#79.83#-2108165;' +
      '4#Kolkata, West Bengal, India#IN#IN28#22.5697#88.3697#-2092511';
    expect(extractCountries(v1locations)).toEqual(['India']);
  });

  it('renvoie [] pour un champ vide', () => {
    expect(extractCountries('')).toEqual([]);
  });
});

describe('normalizeGkgLine -- vraies lignes completes', () => {
  it('normalise la vraie ligne thehindu.com (cybercriminalite financiere, Inde)', () => {
    const line = loadLines().find((l) => l.includes('thehindu.com'))!;
    const result = normalizeGkgLine(line);

    expect(result).not.toBeNull();
    expect(result!.externalId).toBe('20260905071500-163');
    expect(result!.url).toBe(
      'https://www.thehindu.com/news/cities/chennai/ed-arrests-two-in-40-crore-hashpe-cryptocurrency-fraud/article71429252.ece',
    );
    expect(result!.title).toBe('ED arrests two in ₹40-crore HashPe cryptocurrency fraud');
    expect(result!.publishedAt?.toISOString()).toBe('2026-09-05T07:15:00.000Z');
    // V1ORGANIZATIONS est en minuscules dans le vrai flux GDELT (verifie).
    expect(result!.contentExcerpt).toContain('cyber crime police');
    expect(result!.contentExcerpt).toContain('Pays: India');
  });

  it('renvoie null pour une vraie ligne sans theme cyber (newburytoday.co.uk)', () => {
    const line = loadLines().find((l) => l.includes('newburytoday.co.uk'))!;
    expect(normalizeGkgLine(line)).toBeNull();
  });

  it('normalise les 4 vraies lignes clones (meme titre exact, URLs distinctes)', () => {
    const lines = loadLines().filter(
      (l) =>
        l.includes('philippinetimes.com') ||
        l.includes('japanherald.com') ||
        l.includes('haitisun.com') ||
        l.includes('zimbabwestar.com'),
    );
    expect(lines).toHaveLength(4);

    const results = lines.map((l) => normalizeGkgLine(l));
    for (const r of results) {
      expect(r).not.toBeNull();
      expect(r!.title).toBe('OpenAI agents turned German website into message board  Reuters');
    }

    const urls = new Set(results.map((r) => r!.url));
    expect(urls.size).toBe(4); // 4 URLs bien distinctes malgre le meme contenu
  });
});
