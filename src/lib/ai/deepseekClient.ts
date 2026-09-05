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

// Bornes d'un critere individuel (cf. migration 012).
const SCORE_MIN = 0;
const SCORE_MAX = 5;

// Seuils de palier fournis par l'utilisateur (echange du 2026-09-05),
// total sur 25 (5 criteres notes 0-5 chacun) -- calcules cote serveur,
// jamais demandes au modele : lui faire annoncer aussi le palier
// ouvrirait la porte a une incoherence entre les scores et le palier
// (ex: total=15 mais palier="prioritaire").
const TIER_REJECT_MAX = 7; // total < 8
const TIER_CONSERVE_MAX = 12; // 8-12
const TIER_VEILLE_MAX = 17; // 13-17
// 18+ => 'prioritaire'

export type ReviewTier = 'rejete' | 'conserve' | 'veille' | 'prioritaire';

/**
 * Instruction envoyee a DeepSeek pour trancher un cas que le filtre
 * thematique/mots-cles deterministe de gdelt et google_news_fr ne sait pas
 * resoudre lui-meme (cf. §"faux positifs confirmes en prod" dans la
 * migration 008). Remplace la decision binaire is_relevant par un scoring
 * a 5 criteres (Phase 8, cf. migration 012) : plus riche qu'un simple
 * booleen, et evite de reduire prematurement une evaluation nuancee a
 * oui/non avant meme de savoir sur quels criteres elle repose. Reponse
 * forcee en JSON strict pour rester parseable sans ambiguite -- aucune
 * prose libre acceptee.
 */
const SYSTEM_PROMPT = `Tu es un analyste en cyber-renseignement pour un service de veille OSINT.

On te donne le titre et un extrait d'un article de presse, deja pre-filtre par une recherche par mots-cles thematiques (GDELT ou Google Actualites) qui produit beaucoup de faux positifs : articles boursiers, geopolitique generale, conflits militaires classiques, licenciements, actualite institutionnelle, conferences ou annonces produit -- qui mentionnent juste incidemment un terme proche sans decrire un incident cyber reel.

Ta tache : evaluer ce texte selon 5 criteres independants, chacun note par un entier de 0 a 5 :

- pertinence_cyber : decrit-il REELLEMENT un evenement de cybersecurite concret (cyberattaque, fuite de donnees, rancongiciel, fraude ou cybercriminalite, campagne de logiciel malveillant, vulnerabilite activement exploitee, operation d'espionnage informatique, etc.) ? 0 si c'est une mention tangentielle, une metaphore ou un sujet sans rapport ; 5 si c'est manifestement et principalement un incident cyber.
- impact : ampleur reelle des consequences decrites (organisations/personnes touchees, criticite du service affecte, duree). 0 si aucun impact concret n'est decrit.
- interet_strategique : pertinence pour une veille cyberdefense francaise -- secteur touche (defense, administration publique, infrastructures critiques, spatial, energie, sante, OT/ICS/SCADA, telecommunications) et/ou dimension etatique (espionnage, APT, sabotage). 0 si le sujet est purement prive et sans dimension strategique.
- fiabilite_source : le texte cite-t-il des faits verifiables (organisme officiel, CVE, chiffres precis, citation attribuee) plutot que des rumeurs ou affirmations non sourcees ? 0 si tres incertain, 5 si les faits sont clairement etablis.
- nouveaute : s'agit-il d'une information nouvelle/inhabituelle plutot que la repetition d'un sujet deja largement couvert ou d'une generalite deja connue ? 0 si c'est un sujet rebattu, 5 si c'est un fait notable et recent.

Reponds UNIQUEMENT avec un objet JSON de cette forme exacte, sans texte autour :
{"pertinence_cyber": 0-5, "impact": 0-5, "interet_strategique": 0-5, "fiabilite_source": 0-5, "nouveaute": 0-5, "severity": "low"|"medium"|"high"|"critical", "confidence": "low"|"medium"|"high", "reasoning": "une phrase courte en francais"}

- Chaque score est un entier entre 0 et 5, jamais un decimal.
- severity : gravite technique reelle si le texte decrit un incident cyber concret (sinon "low", sans importance).
- confidence : ta confiance dans cette evaluation (pas dans la gravite).
- reasoning : une phrase courte justifiant les scores, en francais.
- Ne calcule et n'annonce jamais toi-meme un total ou un palier -- donne uniquement les 5 scores individuels.`;

export interface DeepseekReviewInput {
  title: string;
  excerpt: string;
}

export interface DeepseekReviewScores {
  pertinenceCyber: number;
  impact: number;
  interetStrategique: number;
  fiabiliteSource: number;
  nouveaute: number;
}

export interface DeepseekReview {
  scores: DeepseekReviewScores;
  /** Somme des 5 scores (0-25), calculee cote serveur -- jamais renvoyee par le modele. */
  scoreTotal: number;
  /** Palier deduit deterministiquement de scoreTotal (cf. computeReviewTier). */
  tier: ReviewTier;
  /** Derive de tier (tier !== 'rejete') -- conserve pour la colonne is_relevant existante (migration 008), comportement inchange. */
  isRelevant: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
}

interface DeepseekChatResponse {
  choices?: { message?: { content?: string } }[];
}

function computeScoreTotal(scores: DeepseekReviewScores): number {
  return (
    scores.pertinenceCyber + scores.impact + scores.interetStrategique + scores.fiabiliteSource + scores.nouveaute
  );
}

/**
 * Paliers fournis par l'utilisateur (cf. migration 012) : < 8 rejete,
 * 8-12 conserve, 13-17 veille, 18+ prioritaire. Fonction pure et
 * exportee pour etre testee independamment de tout appel reseau.
 */
export function computeReviewTier(scoreTotal: number): ReviewTier {
  if (scoreTotal <= TIER_REJECT_MAX) return 'rejete';
  if (scoreTotal <= TIER_CONSERVE_MAX) return 'conserve';
  if (scoreTotal <= TIER_VEILLE_MAX) return 'veille';
  return 'prioritaire';
}

function validateScoreValue(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < SCORE_MIN || value > SCORE_MAX) {
    throw new Error(`Reponse DeepSeek invalide (${field} doit etre un entier entre 0 et 5)`);
  }
  return value;
}

function validateReview(parsed: unknown): DeepseekReview {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Reponse DeepSeek invalide (pas un objet JSON)');
  }

  const p = parsed as Record<string, unknown>;

  const scores: DeepseekReviewScores = {
    pertinenceCyber: validateScoreValue(p.pertinence_cyber, 'pertinence_cyber'),
    impact: validateScoreValue(p.impact, 'impact'),
    interetStrategique: validateScoreValue(p.interet_strategique, 'interet_strategique'),
    fiabiliteSource: validateScoreValue(p.fiabilite_source, 'fiabilite_source'),
    nouveaute: validateScoreValue(p.nouveaute, 'nouveaute'),
  };

  if (typeof p.severity !== 'string' || !VALID_SEVERITIES.has(p.severity)) {
    throw new Error('Reponse DeepSeek invalide (severity)');
  }
  if (typeof p.confidence !== 'string' || !VALID_CONFIDENCES.has(p.confidence)) {
    throw new Error('Reponse DeepSeek invalide (confidence)');
  }
  if (typeof p.reasoning !== 'string' || p.reasoning.length === 0) {
    throw new Error('Reponse DeepSeek invalide (reasoning)');
  }

  const scoreTotal = computeScoreTotal(scores);
  const tier = computeReviewTier(scoreTotal);

  return {
    scores,
    scoreTotal,
    tier,
    isRelevant: tier !== 'rejete',
    severity: p.severity as DeepseekReview['severity'],
    confidence: p.confidence as DeepseekReview['confidence'],
    reasoning: p.reasoning,
  };
}

/**
 * Appelle DeepSeek (API compatible OpenAI, cf. platform.deepseek.com/docs)
 * pour relire un evenement gdelt/google_news_fr et le noter selon les 5
 * criteres de la Phase 8 (cf. SYSTEM_PROMPT).
 *
 * Ne fait aucune retry interne : un echec (timeout, quota, reponse
 * malformee) remonte tel quel a l'appelant (reviewGdeltEvents.ts), qui
 * laisse l'evenement non relu -- il sera retente au prochain passage
 * planifie plutot que de bloquer ou de deviner une valeur par defaut.
 */
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
        // 2026-09-05) -- inutile et couteux pour un simple scoring
        // 0-5 x 5 criteres + severity/confidence, et surtout : en mode thinking,
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

// ---------------------------------------------------------------------
// Phase 6 : compte rendu de situation "analyste" (rediges par DeepSeek)
// ---------------------------------------------------------------------

/**
 * Instruction envoyee a DeepSeek pour rediger le compte rendu de situation
 * (Phase 6). Reprend le brief analyste fourni par l'utilisateur (tri,
 * recoupement, hierarchisation par criticite reelle -- pas un simple
 * resume plat) -- traduit en sortie JSON stricte (au lieu du markdown a
 * emoji du brief original) pour rester exploitable programmatiquement par
 * le frontend, champ par champ, sans reparser du texte libre.
 *
 * La matiere premiere est deja filtree (is_relevant=true, cf.
 * pipeline/generateSituationReport.ts) -- la seule tache est d'analyser
 * des evenements REELS deja etablis, jamais d'en inventer.
 */
const REPORT_SYSTEM_PROMPT = `Tu es CYBERWATCH, un analyste specialise en veille cyber, cyberdefense, vulnerabilites, menaces numeriques, renseignement cyber et securite des systemes d'information, pour un service de veille OSINT (Ministere des Armees francais).

Tu ne te comportes pas comme un chatbot generaliste. Ta mission est de transformer les evenements reels fournis (deja collectes et filtres) en un compte rendu de veille clair, synthetique, hierarchise et exploitable operationnellement. Tu travailles comme un analyste : tu tries, recoupes, contextualises, fusionnes les doublons, evalues la criticite reelle et identifies ce qui merite vraiment l'attention.

PRINCIPE FONDAMENTAL
Ne produis JAMAIS une liste exhaustive des evenements recus. Selectionne uniquement ce qui a une reelle valeur de veille. Une vulnerabilite avec un score eleve mais sans exploitation connue n'est pas automatiquement plus importante qu'une vulnerabilite moins grave mais activement exploitee. Prends en compte : exploitation connue, presence dans CISA KEV (le tag de source "cisa_kev" l'indique), campagne d'attaque associee, ransomware, espionnage, menace etatique, impact potentiel, exposition des produits concernes, criticite du secteur touche, caractere nouveau ou inhabituel.

PRIORISATION
Priorite CRITIQUE : vulnerabilite activement exploitee ou ajoutee au CISA KEV, zero-day, campagne cyber majeure, activite APT, espionnage etatique, attaque contre defense/gouvernement/infrastructures critiques, compromission massive, ransomware a fort impact, attaque supply-chain, compromission d'un editeur/fournisseur strategique.
Priorite ELEVEE : forte probabilite d'exploitation, vulnerabilite critique sur equipements reseau/securite/virtualisation/cloud/identite, campagne de phishing ou malware significative, attaque OT/ICS/SCADA, nouvelles techniques d'acteurs cyber.
Priorite MODEREE : vulnerabilite importante mais sans exploitation observee, correctif significatif, evolution interessante d'une menace existante.
Les elements a faible valeur ne figurent pas dans le compte rendu.

DOMAINES A SURVEILLER PARTICULIEREMENT (liste non exhaustive, mais attention renforcee) : defense, administrations publiques, infrastructures critiques, spatial, aeronautique, telecommunications, energie, OT/ICS/SCADA, satellites, chaines logistiques numeriques, cloud, VPN, firewalls, equipements reseau, hyperviseurs, systemes d'identite, Microsoft, Linux, VMware, Cisco, Fortinet, Palo Alto, Ivanti, Citrix, equipements industriels.

SCORE DE PRE-FILTRAGE AUTOMATIQUE
Certains evenements (sources gdelt et google_news_fr uniquement) portent un score de pre-filtrage automatique note "Score IA (Phase 5) : X/25 (palier)". Ce score est calcule par un premier passage IA distinct, selon 5 criteres (pertinence cyber, impact, interet strategique, fiabilite de la source, nouveaute), avec un palier associe (conserve/veille/prioritaire). C'est un signal automatise SUPPLEMENTAIRE, pas un jugement definitif ni un substitut a ta propre lecture : un evenement marque "prioritaire" par ce score peut se reveler moins interessant une fois le contenu reellement analyse, et inversement un evenement "conserve" peut meriter une place en tete du compte rendu si le contenu reel le justifie. Ne recopie jamais ce palier tel quel comme criticite de ton compte rendu -- ta propre evaluation (fondee sur les faits reels fournis) prime toujours. Les evenements sans ce score (CERT-FR, CISA KEV, Microsoft MSRC) sont des sources institutionnelles qui n'en ont jamais besoin -- son absence n'indique aucune moindre importance.

FUSION DES DOUBLONS
Si plusieurs evenements fournis decrivent manifestement le meme incident reel (memes faits, memes entites), fusionne-les en une seule entree et cite les sources reellement concernees -- ne cree jamais deux entrees pour un seul evenement. Le nombre d'evenements parlant d'un meme sujet n'est jamais a lui seul un indicateur de criticite.

FIABILITE -- REGLE ABSOLUE
N'invente JAMAIS : un groupe cyber, une attribution, une victime, un CVE, un score, une exploitation, une date, un pays, un produit, une consequence. N'utilise QUE les evenements fournis ci-apres (titre, resume, categorie, severite, source, pays, organisations, secteurs, CVE, acteurs de menace, techniques MITRE deja associes reellement a chaque evenement) -- si une information n'y figure pas, ne la complete jamais par une supposition. Distingue dans ta redaction ce qui est un FAIT etabli d'une EVALUATION (ton analyse) ou d'une HYPOTHESE (incertaine) -- utilise des formulations comme "a ce stade", "l'attribution n'est pas confirmee", "aucune exploitation active n'est mentionnee" plutot que d'affirmer sans base. Une attribution reposant seulement sur une similarite technique, une infrastructure commune ou une revendication non verifiee doit etre presentee avec un niveau de confiance explicite (confiance elevee / moyenne / faible) dans le texte, jamais comme certaine.

Aucune donnee EPSS ni score CVSS chiffre ne t'est fournie : ne renseigne jamais ces valeurs, laisse-les absentes (null) plutot que d'en deviner une.

REGLE DE SYNTHESE
Le compte rendu doit etre beaucoup plus court que les donnees sources : un grand nombre d'evenements bruts ne doit produire qu'une poignee d'entrees "a_retenir" reellement pertinentes, et une synthese executive de 2 a 4 evenements majeurs maximum. La valeur vient de la selection, pas du volume.

REGLE DE NON-EVENEMENT
S'il n'y a aucun evenement cyber majeur dans les donnees fournies, dis-le explicitement dans la synthese executive et laisse les tableaux de sections vides -- ne remplis jamais artificiellement le compte rendu.

STYLE
Professionnel, factuel, analytique, concis, oriente aide a la decision. Evite le sensationnalisme, les superlatifs inutiles, les longues introductions, le jargon inutile, les repetitions. Prefere "Une vulnerabilite critique affectant FortiOS est activement exploitee. Elle permet..." a "Fortinet vient de publier une nouvelle vulnerabilite extremement dangereuse...". Redige en francais.

FORMAT DE REPONSE
Reponds UNIQUEMENT avec un objet JSON de cette forme exacte, sans texte autour, sans balise markdown :
{
  "synthese_executive": "5 a 10 lignes maximum ; si un seul evenement est vraiment important, dis-le ; si aucun, dis-le aussi",
  "a_retenir": [
    {"titre": "court et factuel", "criticite": "CRITIQUE"|"ELEVEE"|"MODEREE", "concerne": "produits/organisations/secteurs concernes", "situation": "ce qui s'est produit", "evaluation": "pourquoi c'est important, consequences possibles", "sources": ["nom de source", "..."]}
  ],
  "vulnerabilites_importantes": [
    {"cve": "CVE-XXXX-XXXXX ou null", "produit": "string", "criticite": "string", "exploitation": "Oui"|"Non connue"|"Suspectee", "kev": "Oui"|"Non", "epss": null, "resume": "tres court", "impact": "tres court"}
  ],
  "menaces_campagnes": [
    {"titre": "string", "objectif": "string ou null", "secteurs": "string ou null", "details": "string"}
  ],
  "ot_ics": [{"titre": "string", "details": "string"}],
  "defense_spatial": [{"titre": "string", "details": "string"}],
  "tendances": ["une phrase par tendance reellement convergente (plusieurs evenements), jamais deduite d'un seul cas"],
  "points_a_surveiller": ["maximum 5 elements pas encore assez etablis pour etre une alerte"]
}

Chaque tableau peut etre vide ([]) quand rien ne merite d'y figurer -- ne force jamais une entree artificielle. "vulnerabilites_importantes" ne contient que des vulnerabilites a valeur operationnelle reelle, pas toutes les vulnerabilites recues.`;

export interface ReportEventInput {
  title: string;
  /** Extrait reel (event.summary ou description), pour une analyse au-dela du seul titre. */
  summary: string;
  category: string;
  severity: string;
  confidence: string;
  /** tags[0] (nom de la source, cf. classifyEvent.buildTags) -- signale aussi l'appartenance CISA KEV. */
  source: string;
  countries: string[];
  organizations: string[];
  sectors: string[];
  cves: string[];
  threatActors: string[];
  mitreTechniques: string[];
  publishedAt: string | null;
  /** Score de pre-filtrage automatique (Phase 8, cf. migration 012) -- null pour les sources institutionnelles jamais notees (certfr, cisa_kev, msrc). */
  scoreTotal: number | null;
  /** Palier associe a scoreTotal ('conserve'|'veille'|'prioritaire') -- null si scoreTotal est null. */
  reviewTier: string | null;
}

export interface ARetenirItem {
  titre: string;
  criticite: 'CRITIQUE' | 'ELEVEE' | 'MODEREE';
  concerne: string;
  situation: string;
  evaluation: string;
  sources: string[];
}

export interface VulnerabiliteItem {
  cve: string | null;
  produit: string;
  criticite: string;
  exploitation: 'Oui' | 'Non connue' | 'Suspectee';
  kev: 'Oui' | 'Non';
  epss: string | null;
  resume: string;
  impact: string;
}

export interface MenaceCampagneItem {
  titre: string;
  objectif: string | null;
  secteurs: string | null;
  details: string;
}

export interface SecteurItem {
  titre: string;
  details: string;
}

export interface DeepseekSituationReport {
  syntheseExecutive: string;
  aRetenir: ARetenirItem[];
  vulnerabilitesImportantes: VulnerabiliteItem[];
  menacesCampagnes: MenaceCampagneItem[];
  otIcs: SecteurItem[];
  defenseSpatial: SecteurItem[];
  tendances: string[];
  pointsASurveiller: string[];
}

const VALID_CRITICITES = new Set(['CRITIQUE', 'ELEVEE', 'MODEREE']);
const VALID_EXPLOITATIONS = new Set(['Oui', 'Non connue', 'Suspectee']);
const VALID_KEV = new Set(['Oui', 'Non']);

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function validateARetenir(items: unknown): ARetenirItem[] {
  if (!Array.isArray(items)) throw new Error('Reponse DeepSeek invalide (a_retenir doit etre un tableau)');
  return items.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`Reponse DeepSeek invalide (a_retenir[${i}] n'est pas un objet)`);
    }
    const item = raw as Record<string, unknown>;
    if (typeof item.titre !== 'string' || item.titre.length === 0) {
      throw new Error(`Reponse DeepSeek invalide (a_retenir[${i}].titre)`);
    }
    if (typeof item.criticite !== 'string' || !VALID_CRITICITES.has(item.criticite)) {
      throw new Error(`Reponse DeepSeek invalide (a_retenir[${i}].criticite)`);
    }
    if (typeof item.concerne !== 'string') throw new Error(`Reponse DeepSeek invalide (a_retenir[${i}].concerne)`);
    if (typeof item.situation !== 'string') throw new Error(`Reponse DeepSeek invalide (a_retenir[${i}].situation)`);
    if (typeof item.evaluation !== 'string') throw new Error(`Reponse DeepSeek invalide (a_retenir[${i}].evaluation)`);
    if (!isStringArray(item.sources)) throw new Error(`Reponse DeepSeek invalide (a_retenir[${i}].sources)`);
    return {
      titre: item.titre,
      criticite: item.criticite as ARetenirItem['criticite'],
      concerne: item.concerne,
      situation: item.situation,
      evaluation: item.evaluation,
      sources: item.sources,
    };
  });
}

function validateVulnerabilites(items: unknown): VulnerabiliteItem[] {
  if (!Array.isArray(items)) throw new Error('Reponse DeepSeek invalide (vulnerabilites_importantes doit etre un tableau)');
  return items.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`Reponse DeepSeek invalide (vulnerabilites_importantes[${i}] n'est pas un objet)`);
    }
    const item = raw as Record<string, unknown>;
    if (item.cve !== null && typeof item.cve !== 'string') {
      throw new Error(`Reponse DeepSeek invalide (vulnerabilites_importantes[${i}].cve)`);
    }
    if (typeof item.produit !== 'string') throw new Error(`Reponse DeepSeek invalide (vulnerabilites_importantes[${i}].produit)`);
    if (typeof item.criticite !== 'string') throw new Error(`Reponse DeepSeek invalide (vulnerabilites_importantes[${i}].criticite)`);
    if (typeof item.exploitation !== 'string' || !VALID_EXPLOITATIONS.has(item.exploitation)) {
      throw new Error(`Reponse DeepSeek invalide (vulnerabilites_importantes[${i}].exploitation)`);
    }
    if (typeof item.kev !== 'string' || !VALID_KEV.has(item.kev)) {
      throw new Error(`Reponse DeepSeek invalide (vulnerabilites_importantes[${i}].kev)`);
    }
    if (item.epss !== null && typeof item.epss !== 'string') {
      throw new Error(`Reponse DeepSeek invalide (vulnerabilites_importantes[${i}].epss)`);
    }
    if (typeof item.resume !== 'string') throw new Error(`Reponse DeepSeek invalide (vulnerabilites_importantes[${i}].resume)`);
    if (typeof item.impact !== 'string') throw new Error(`Reponse DeepSeek invalide (vulnerabilites_importantes[${i}].impact)`);
    return {
      cve: item.cve,
      produit: item.produit,
      criticite: item.criticite,
      exploitation: item.exploitation as VulnerabiliteItem['exploitation'],
      kev: item.kev as VulnerabiliteItem['kev'],
      epss: item.epss,
      resume: item.resume,
      impact: item.impact,
    };
  });
}

function validateMenaces(items: unknown): MenaceCampagneItem[] {
  if (!Array.isArray(items)) throw new Error('Reponse DeepSeek invalide (menaces_campagnes doit etre un tableau)');
  return items.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`Reponse DeepSeek invalide (menaces_campagnes[${i}] n'est pas un objet)`);
    }
    const item = raw as Record<string, unknown>;
    if (typeof item.titre !== 'string') throw new Error(`Reponse DeepSeek invalide (menaces_campagnes[${i}].titre)`);
    if (item.objectif !== null && typeof item.objectif !== 'string') {
      throw new Error(`Reponse DeepSeek invalide (menaces_campagnes[${i}].objectif)`);
    }
    if (item.secteurs !== null && typeof item.secteurs !== 'string') {
      throw new Error(`Reponse DeepSeek invalide (menaces_campagnes[${i}].secteurs)`);
    }
    if (typeof item.details !== 'string') throw new Error(`Reponse DeepSeek invalide (menaces_campagnes[${i}].details)`);
    return { titre: item.titre, objectif: item.objectif, secteurs: item.secteurs, details: item.details };
  });
}

function validateSecteurItems(items: unknown, field: string): SecteurItem[] {
  if (!Array.isArray(items)) throw new Error(`Reponse DeepSeek invalide (${field} doit etre un tableau)`);
  return items.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`Reponse DeepSeek invalide (${field}[${i}] n'est pas un objet)`);
    }
    const item = raw as Record<string, unknown>;
    if (typeof item.titre !== 'string') throw new Error(`Reponse DeepSeek invalide (${field}[${i}].titre)`);
    if (typeof item.details !== 'string') throw new Error(`Reponse DeepSeek invalide (${field}[${i}].details)`);
    return { titre: item.titre, details: item.details };
  });
}

function validateReport(parsed: unknown): DeepseekSituationReport {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Reponse DeepSeek invalide (pas un objet JSON)');
  }

  const p = parsed as Record<string, unknown>;

  if (typeof p.synthese_executive !== 'string' || p.synthese_executive.trim().length === 0) {
    throw new Error('Reponse DeepSeek invalide (synthese_executive manquante)');
  }
  if (!isStringArray(p.tendances)) throw new Error('Reponse DeepSeek invalide (tendances)');
  if (!isStringArray(p.points_a_surveiller)) throw new Error('Reponse DeepSeek invalide (points_a_surveiller)');

  return {
    syntheseExecutive: p.synthese_executive,
    aRetenir: validateARetenir(p.a_retenir),
    vulnerabilitesImportantes: validateVulnerabilites(p.vulnerabilites_importantes),
    menacesCampagnes: validateMenaces(p.menaces_campagnes),
    otIcs: validateSecteurItems(p.ot_ics, 'ot_ics'),
    defenseSpatial: validateSecteurItems(p.defense_spatial, 'defense_spatial'),
    tendances: p.tendances,
    pointsASurveiller: p.points_a_surveiller,
  };
}

// Longueur max de l'extrait envoye par evenement : borne la taille du
// prompt (cout/latence) sur un lot de REPORT_EVENT_LIMIT evenements plutot
// que d'envoyer des descriptions completes potentiellement longues.
const EVENT_SUMMARY_MAX_CHARS = 300;

function formatReportEventLine(event: ReportEventInput): string {
  const date = event.publishedAt ? event.publishedAt.slice(0, 10) : 'date inconnue';
  const countries = event.countries.length > 0 ? event.countries.join(', ') : 'pays non precise';
  const excerpt = event.summary.slice(0, EVENT_SUMMARY_MAX_CHARS);
  const parts = [`[${date}]`, `(${event.severity}, ${event.category}, source ${event.source})`, event.title];
  parts.push(`-- ${excerpt}`);
  parts.push(`| Pays: ${countries}`);
  if (event.organizations.length > 0) parts.push(`| Organisations: ${event.organizations.join(', ')}`);
  if (event.sectors.length > 0) parts.push(`| Secteurs: ${event.sectors.join(', ')}`);
  if (event.cves.length > 0) parts.push(`| CVE: ${event.cves.join(', ')}`);
  if (event.threatActors.length > 0) parts.push(`| Acteurs: ${event.threatActors.join(', ')}`);
  if (event.mitreTechniques.length > 0) parts.push(`| MITRE: ${event.mitreTechniques.join(', ')}`);
  // Score de pre-filtrage automatique (Phase 8) : uniquement present pour
  // gdelt/google_news_fr (cf. REVIEWED_SOURCES) -- absent (null) pour les
  // sources institutionnelles, qui n'en ont jamais besoin (cf. prompt).
  if (event.reviewTier !== null && event.scoreTotal !== null) {
    parts.push(`| Score IA (Phase 5): ${event.scoreTotal}/25 (${event.reviewTier})`);
  }
  return `- ${parts.join(' ')}`;
}

/**
 * Appelle DeepSeek pour analyser une liste d'evenements reels deja filtres
 * et produire un compte rendu de situation hierarchise (Phase 6).
 *
 * Contrairement a reviewEventWithDeepseek (triage deterministe d'UN seul
 * evenement, ou le thinking est desactive car il ignore temperature et
 * n'apporte rien a un JSON booleen), cette analyse -- tri, recoupement,
 * priorisation par criticite reelle -- beneficie reellement du
 * raisonnement, et ce job tourne quelques fois par jour seulement (pas
 * par evenement, cf. jobs/situationReportScheduler.ts) : le cout
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
          { role: 'user', content: `Evenements reels a analyser (${events.length}) :\n${eventsBlock}` },
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
