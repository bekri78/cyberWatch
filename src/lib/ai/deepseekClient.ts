const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
// 'deepseek-chat' (utilise a l'origine) a ete retire par DeepSeek le
// 2026-07-24 (cf. changelog officiel api-docs.deepseek.com/updates) --
// 'deepseek-v4-flash' est son successeur direct (mode non-thinking, meme
// tarif : 0,14 $/1M tokens en entree hors cache, 0,28 $/1M en sortie,
// cf. verification faite le 2026-09-05). Sans cette mise a jour, la
// relecture IA continuerait d'echouer meme apres recharge du compte.
const DEEPSEEK_MODEL = 'deepseek-v4-flash';
const REQUEST_TIMEOUT_MS = 20_000;

const VALID_SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);
const VALID_CONFIDENCES = new Set(['low', 'medium', 'high']);

/**
 * Instruction envoyee a DeepSeek pour trancher un cas que le filtre
 * thematique deterministe de gdelt (CYBER_ATTACK/WB_2457_CYBER_CRIME) ne
 * sait pas resoudre lui-meme (cf. §"faux positifs confirmes en prod" dans
 * la migration 008). Reponse forcee en JSON strict pour rester parseable
 * sans ambiguite -- aucune prose libre acceptee.
 */
const SYSTEM_PROMPT = `Tu es un analyste en cyber-renseignement pour un service de veille OSINT.

On te donne le titre et un extrait d'un article de presse mondiale, deja pre-filtre par un systeme de mots-cles thematiques (GDELT, themes "CYBER_ATTACK" / "WB_2457_CYBER_CRIME"). Ce filtre par mots-cles produit beaucoup de faux positifs : articles boursiers, geopolitique generale, conflits militaires classiques, licenciements, actualite institutionnelle -- qui mentionnent juste incidemment un terme proche sans decrire un incident cyber reel.

Ta tache : determiner si ce texte decrit REELLEMENT un evenement de cybersecurite concret (cyberattaque, fuite de donnees, rancongiciel, fraude ou cybercriminalite, campagne de logiciel malveillant, vulnerabilite activement exploitee, operation d'espionnage informatique, etc.), et non une mention tangentielle, une metaphore, ou un sujet sans rapport.

Reponds UNIQUEMENT avec un objet JSON de cette forme exacte, sans texte autour :
{"is_relevant": boolean, "severity": "low"|"medium"|"high"|"critical", "confidence": "low"|"medium"|"high", "reasoning": "une phrase courte en francais"}

- is_relevant=false des que le texte n'est pas reellement un evenement de cybersecurite concret.
- severity : gravite technique reelle si is_relevant=true (sinon "low", sans importance).
- confidence : ta confiance dans ce jugement (pas dans la gravite).
- reasoning : une phrase courte justifiant la decision, en francais.`;

export interface DeepseekReviewInput {
  title: string;
  excerpt: string;
}

export interface DeepseekReview {
  isRelevant: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
}

interface DeepseekChatResponse {
  choices?: { message?: { content?: string } }[];
}

function validateReview(parsed: unknown): DeepseekReview {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Reponse DeepSeek invalide (pas un objet JSON)');
  }

  const p = parsed as Record<string, unknown>;

  if (typeof p.is_relevant !== 'boolean') {
    throw new Error('Reponse DeepSeek invalide (is_relevant manquant ou non booleen)');
  }
  if (typeof p.severity !== 'string' || !VALID_SEVERITIES.has(p.severity)) {
    throw new Error('Reponse DeepSeek invalide (severity)');
  }
  if (typeof p.confidence !== 'string' || !VALID_CONFIDENCES.has(p.confidence)) {
    throw new Error('Reponse DeepSeek invalide (confidence)');
  }
  if (typeof p.reasoning !== 'string' || p.reasoning.length === 0) {
    throw new Error('Reponse DeepSeek invalide (reasoning)');
  }

  return {
    isRelevant: p.is_relevant,
    severity: p.severity as DeepseekReview['severity'],
    confidence: p.confidence as DeepseekReview['confidence'],
    reasoning: p.reasoning,
  };
}

/**
 * Appelle DeepSeek (API compatible OpenAI, cf. platform.deepseek.com/docs)
 * pour relire un evenement gdelt et decider s'il est reellement pertinent.
 *
 * Ne fait aucune retry interne : un echec (timeout, quota, reponse
 * malformee) remonte tel quel a l'appelant (reviewGdeltEvents.ts), qui
 * laisse l'evenement non relu -- il sera retente au prochain passage
 * planifie plutot que de bloquer ou de deviner une valeur par defaut.
 */
/**
 * Instruction envoyee a DeepSeek pour rediger le compte rendu de situation
 * (Phase 6). Contrairement au triage (SYSTEM_PROMPT ci-dessus), la matiere
 * premiere ici est deja filtree (is_relevant=true, cf.
 * pipeline/generateSituationReport.ts) -- la seule tache est de synthetiser
 * des evenements REELS deja etablis, jamais d'en inventer.
 */
const REPORT_SYSTEM_PROMPT = `Tu es analyste en cyber-renseignement pour un service de veille OSINT (Ministere des Armees francais). Tu rediges un compte rendu de situation cyber a partir d'une liste d'evenements REELLEMENT collectes (fournie ci-dessous), et de rien d'autre.

Regles strictes :
- N'utilise QUE les evenements fournis. N'invente aucun fait, aucune date, aucun pays, aucune organisation qui n'y figure pas.
- Redige en francais, registre professionnel (note de synthese), sans familiarite ni sensationnalisme.
- summary : 3 a 5 phrases degageant les tendances de la periode (categories dominantes, zones geographiques citees, niveau de gravite global), sans lister chaque evenement un par un.
- key_points : 3 a 6 puces courtes ; chacune peut citer un evenement precis marquant (severite critique/elevee) par son titre exact tel que fourni, sans reformuler ni ajouter de details absents de la liste.
- Si la liste est vide ou tres courte, dis-le explicitement plutot que d'inventer du contenu pour la remplir.

Reponds UNIQUEMENT avec un objet JSON de cette forme exacte, sans texte autour :
{"summary": "...", "key_points": ["...", "..."]}`;

export interface ReportEventInput {
  title: string;
  category: string;
  severity: string;
  source: string;
  countries: string[];
  publishedAt: string | null;
}

export interface DeepseekSituationReport {
  summary: string;
  keyPoints: string[];
}

function validateReport(parsed: unknown): DeepseekSituationReport {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Reponse DeepSeek invalide (pas un objet JSON)');
  }

  const p = parsed as Record<string, unknown>;

  if (typeof p.summary !== 'string' || p.summary.trim().length === 0) {
    throw new Error('Reponse DeepSeek invalide (summary manquant)');
  }
  if (!Array.isArray(p.key_points) || !p.key_points.every((v) => typeof v === 'string')) {
    throw new Error('Reponse DeepSeek invalide (key_points)');
  }

  return { summary: p.summary, keyPoints: p.key_points as string[] };
}

function formatReportEventLine(event: ReportEventInput): string {
  const date = event.publishedAt ? event.publishedAt.slice(0, 10) : 'date inconnue';
  const countries = event.countries.length > 0 ? event.countries.join(', ') : 'pays non precise';
  return `- [${date}] (${event.severity}, ${event.category}, source ${event.source}) ${event.title} -- ${countries}`;
}

/**
 * Appelle DeepSeek pour synthetiser une liste d'evenements reels deja
 * filtres en un compte rendu redige (Phase 6).
 *
 * Contrairement a reviewEventWithDeepseek (triage deterministe d'UN seul
 * evenement, ou le thinking est desactive car il ignore temperature et
 * n'apporte rien a un JSON booleen), la synthese de plusieurs dizaines
 * d'evenements en une note coherente beneficie reellement du raisonnement
 * -- et ce job tourne quelques fois par jour seulement (pas par
 * evenement, cf. jobs/situationReportScheduler.ts), donc le cout
 * supplementaire reste negligeable. Thinking est donc laisse actif
 * (comportement par defaut de deepseek-v4-flash) plutot que desactive.
 *
 * Meme philosophie de resilience que reviewEventWithDeepseek : aucune
 * retry interne, un echec remonte tel quel a l'appelant.
 */
export async function requestSituationReport(
  events: ReportEventInput[],
  apiKey: string,
): Promise<DeepseekSituationReport> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const eventsBlock =
    events.length > 0 ? events.map(formatReportEventLine).join('\n') : '(aucun evenement disponible pour cette periode)';

  let response: Response;
  try {
    response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: REPORT_SYSTEM_PROMPT },
          { role: 'user', content: `Evenements (${events.length}) :\n${eventsBlock}` },
        ],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`DeepSeek API a repondu ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as DeepseekChatResponse;
  const content = body.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Reponse DeepSeek sans contenu (choices[0].message.content absent)');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Reponse DeepSeek non-JSON malgre response_format json_object');
  }

  return validateReport(parsed);
}

export async function reviewEventWithDeepseek(
  input: DeepseekReviewInput,
  apiKey: string,
): Promise<DeepseekReview> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        response_format: { type: 'json_object' },
        temperature: 0,
        // deepseek-v4-flash active le "thinking" (raisonnement) PAR DEFAUT,
        // effort "high", des que ce champ est absent (cf. guide officiel
        // api-docs.deepseek.com/guides/thinking_mode, verifie le
        // 2026-09-05) -- inutile et couteux pour une simple triage
        // is_relevant/severity/confidence, et surtout : en mode thinking,
        // "temperature" est silencieusement ignore, ce qui casserait le
        // caractere deterministe recherche ici. On le desactive donc
        // explicitement pour retrouver le comportement de l'ancien
        // deepseek-chat (non-thinking).
        thinking: { type: 'disabled' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Titre: ${input.title}\n\nExtrait: ${input.excerpt}` },
        ],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`DeepSeek API a repondu ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as DeepseekChatResponse;
  const content = body.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Reponse DeepSeek sans contenu (choices[0].message.content absent)');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Reponse DeepSeek non-JSON malgre response_format json_object');
  }

  return validateReview(parsed);
}
