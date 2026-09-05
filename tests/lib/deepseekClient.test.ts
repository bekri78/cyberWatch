import { afterEach, describe, expect, it, vi } from 'vitest';
import { reviewEventWithDeepseek } from '../../src/lib/ai/deepseekClient';

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
