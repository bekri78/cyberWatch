import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestSituationReport, reviewEventWithDeepseek } from '../../src/lib/ai/deepseekClient';

/**
 * Les 3 cas ci-dessous sont les vrais faux positifs gdelt confirmes en
 * production (cf. migration 008 -- verification live du 2026-09-05 sur
 * /api/v1/events?category=attack) plus un vrai vrai-positif deja verifie a
 * l'etage normalize.ts (thehindu.com). L'appel reseau lui-meme est simule
 * (cout/determinisme d'un test unitaire) mais le texte d'entree est reel,
 * pas invente -- seule la reponse DeepSeek est une simulation de ce qu'un
 * bon jugement humain donnerait sur ce texte.
 */

function mockFetchOnce(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      json: async () => body,
    })),
  );
}

function deepseekBody(content: string) {
  return { choices: [{ message: { content } }] };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reviewEventWithDeepseek', () => {
  it('reconnait un vrai faux positif gdelt (licenciements Tata/JLR, sans rapport avec un incident cyber)', async () => {
    mockFetchOnce(
      200,
      deepseekBody(
        JSON.stringify({
          is_relevant: false,
          severity: 'low',
          confidence: 'high',
          reasoning: "Actualite sur des suppressions d'emplois, aucun incident de cybersecurite decrit.",
        }),
      ),
    );

    const review = await reviewEventWithDeepseek(
      { title: 'Tata-owned JLR to cut 4,000 jobs', excerpt: 'Themes GDELT: CYBER_ATTACK' },
      'fake-api-key',
    );

    expect(review.isRelevant).toBe(false);
    expect(review.confidence).toBe('high');
  });

  it('reconnait un vrai vrai-positif (fraude cryptomonnaie, meme texte que gdelt-normalize.test.ts)', async () => {
    mockFetchOnce(
      200,
      deepseekBody(
        JSON.stringify({
          is_relevant: true,
          severity: 'medium',
          confidence: 'high',
          reasoning: 'Arrestations reelles pour fraude a la cryptomonnaie, incident de cybercriminalite concret.',
        }),
      ),
    );

    const review = await reviewEventWithDeepseek(
      {
        title: 'ED arrests two in ₹40-crore HashPe cryptocurrency fraud',
        excerpt: 'Pays: India — Organisations: cyber crime police — Themes GDELT: WB_2457_CYBER_CRIME, CYBER_ATTACK',
      },
      'fake-api-key',
    );

    expect(review.isRelevant).toBe(true);
    expect(review.severity).toBe('medium');
  });

  it('envoie la cle API en Bearer et le titre/extrait dans le message utilisateur', async () => {
    mockFetchOnce(
      200,
      deepseekBody(JSON.stringify({ is_relevant: true, severity: 'low', confidence: 'low', reasoning: 'x' })),
    );

    await reviewEventWithDeepseek({ title: 'Mon Titre', excerpt: 'Mon Extrait' }, 'ma-cle-secrete');

    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const [url, requestInit] = call as [string, RequestInit];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect((requestInit.headers as Record<string, string>).Authorization).toBe('Bearer ma-cle-secrete');
    const parsedBody = JSON.parse(requestInit.body as string);
    expect(parsedBody.messages[1].content).toContain('Mon Titre');
    expect(parsedBody.messages[1].content).toContain('Mon Extrait');
  });

  it('rejette si le HTTP status n\'est pas ok (ex: quota depasse, cle invalide)', async () => {
    mockFetchOnce(401, {});
    await expect(reviewEventWithDeepseek({ title: 't', excerpt: 'e' }, 'bad-key')).rejects.toThrow(/401/);
  });

  it('rejette si la reponse est un JSON malforme (champ manquant)', async () => {
    mockFetchOnce(200, deepseekBody(JSON.stringify({ severity: 'low', confidence: 'low', reasoning: 'x' })));
    await expect(reviewEventWithDeepseek({ title: 't', excerpt: 'e' }, 'key')).rejects.toThrow(/is_relevant/);
  });

  it("rejette si severity n'est pas une valeur valide", async () => {
    mockFetchOnce(
      200,
      deepseekBody(JSON.stringify({ is_relevant: true, severity: 'catastrophique', confidence: 'low', reasoning: 'x' })),
    );
    await expect(reviewEventWithDeepseek({ title: 't', excerpt: 'e' }, 'key')).rejects.toThrow(/severity/);
  });

  it("rejette si le contenu n'est pas du JSON valide", async () => {
    mockFetchOnce(200, deepseekBody('ceci n\'est pas du JSON'));
    await expect(reviewEventWithDeepseek({ title: 't', excerpt: 'e' }, 'key')).rejects.toThrow(/JSON/);
  });
});

describe('requestSituationReport', () => {
  const sampleEvents = [
    {
      title: 'Fuite de donnees chez un operateur telecom francais',
      summary: 'Des donnees clients ont ete exposees suite a une intrusion.',
      category: 'threat_intel',
      severity: 'high',
      confidence: 'high',
      source: 'certfr',
      countries: ['France'],
      organizations: ['Orange'],
      sectors: ['Telecommunications'],
      cves: [],
      threatActors: [],
      mitreTechniques: [],
      publishedAt: '2026-09-05T10:00:00.000Z',
    },
  ];

  function fullReportBody(overrides: Record<string, unknown> = {}) {
    return {
      synthese_executive: 'x',
      a_retenir: [],
      vulnerabilites_importantes: [],
      menaces_campagnes: [],
      ot_ics: [],
      defense_spatial: [],
      tendances: [],
      points_a_surveiller: [],
      ...overrides,
    };
  }

  it('renvoie un compte rendu structure a partir d\'une reponse DeepSeek valide', async () => {
    mockFetchOnce(
      200,
      deepseekBody(
        JSON.stringify(
          fullReportBody({
            synthese_executive: "Une fuite de donnees a ete signalee chez un operateur telecom francais.",
            a_retenir: [
              {
                titre: 'Fuite de donnees chez un operateur telecom francais',
                criticite: 'ELEVEE',
                concerne: 'Orange, secteur telecommunications',
                situation: 'Des donnees clients ont ete exposees.',
                evaluation: 'Impact potentiel sur la confidentialite des abonnes.',
                sources: ['certfr'],
              },
            ],
          }),
        ),
      ),
    );

    const report = await requestSituationReport(sampleEvents, 'fake-api-key');

    expect(report.syntheseExecutive).toContain('operateur telecom');
    expect(report.aRetenir).toEqual([
      {
        titre: 'Fuite de donnees chez un operateur telecom francais',
        criticite: 'ELEVEE',
        concerne: 'Orange, secteur telecommunications',
        situation: 'Des donnees clients ont ete exposees.',
        evaluation: 'Impact potentiel sur la confidentialite des abonnes.',
        sources: ['certfr'],
      },
    ]);
  });

  it('envoie le titre/resume/pays/organisations/secteurs reels de chaque evenement dans le message utilisateur', async () => {
    mockFetchOnce(200, deepseekBody(JSON.stringify(fullReportBody())));

    await requestSituationReport(sampleEvents, 'ma-cle');

    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const [, requestInit] = call as [string, RequestInit];
    const parsedBody = JSON.parse(requestInit.body as string);
    expect(parsedBody.messages[1].content).toContain('Fuite de donnees chez un operateur telecom francais');
    expect(parsedBody.messages[1].content).toContain('exposees suite a une intrusion');
    expect(parsedBody.messages[1].content).toContain('France');
    expect(parsedBody.messages[1].content).toContain('Orange');
    expect(parsedBody.messages[1].content).toContain('Telecommunications');
    // Contrairement a reviewEventWithDeepseek, le thinking n'est PAS
    // desactive ici (cf. commentaire deepseekClient.ts) -- aucun champ
    // "thinking" dans le corps envoye.
    expect(parsedBody.thinking).toBeUndefined();
  });

  it("indique explicitement l'absence d'evenements plutot que d'en inventer, quand la liste est vide", async () => {
    mockFetchOnce(200, deepseekBody(JSON.stringify(fullReportBody())));

    await requestSituationReport([], 'ma-cle');

    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const [, requestInit] = call as [string, RequestInit];
    const parsedBody = JSON.parse(requestInit.body as string);
    expect(parsedBody.messages[1].content).toContain('aucun evenement disponible');
  });

  it("rejette si le HTTP status n'est pas ok", async () => {
    mockFetchOnce(402, {});
    await expect(requestSituationReport(sampleEvents, 'bad-key')).rejects.toThrow(/402/);
  });

  it('rejette si synthese_executive est manquante', async () => {
    mockFetchOnce(200, deepseekBody(JSON.stringify({ ...fullReportBody(), synthese_executive: undefined })));
    await expect(requestSituationReport(sampleEvents, 'key')).rejects.toThrow(/synthese_executive/);
  });

  it('rejette si a_retenir contient une criticite invalide', async () => {
    mockFetchOnce(
      200,
      deepseekBody(
        JSON.stringify(
          fullReportBody({
            a_retenir: [
              {
                titre: 'x',
                criticite: 'ULTRA-CRITIQUE',
                concerne: 'x',
                situation: 'x',
                evaluation: 'x',
                sources: [],
              },
            ],
          }),
        ),
      ),
    );
    await expect(requestSituationReport(sampleEvents, 'key')).rejects.toThrow(/criticite/);
  });

  it('rejette si vulnerabilites_importantes contient une exploitation invalide', async () => {
    mockFetchOnce(
      200,
      deepseekBody(
        JSON.stringify(
          fullReportBody({
            vulnerabilites_importantes: [
              {
                cve: 'CVE-2026-1234',
                produit: 'x',
                criticite: 'critique',
                exploitation: 'Peut-etre',
                kev: 'Non',
                epss: null,
                resume: 'x',
                impact: 'x',
              },
            ],
          }),
        ),
      ),
    );
    await expect(requestSituationReport(sampleEvents, 'key')).rejects.toThrow(/exploitation/);
  });

  it('rejette si tendances ne contient pas que des chaines', async () => {
    mockFetchOnce(200, deepseekBody(JSON.stringify(fullReportBody({ tendances: [1, 2] }))));
    await expect(requestSituationReport(sampleEvents, 'key')).rejects.toThrow(/tendances/);
  });

  it('accepte les tableaux vides pour toutes les sections (regle de non-evenement)', async () => {
    mockFetchOnce(200, deepseekBody(JSON.stringify(fullReportBody({ synthese_executive: 'Aucun evenement cyber majeur.' }))));

    const report = await requestSituationReport(sampleEvents, 'key');

    expect(report.aRetenir).toEqual([]);
    expect(report.vulnerabilitesImportantes).toEqual([]);
    expect(report.menacesCampagnes).toEqual([]);
    expect(report.otIcs).toEqual([]);
    expect(report.defenseSpatial).toEqual([]);
    expect(report.tendances).toEqual([]);
    expect(report.pointsASurveiller).toEqual([]);
  });
});
