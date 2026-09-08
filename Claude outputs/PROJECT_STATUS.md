# CyberWatch — État du projet (7 septembre 2026)

## 1. Le projet en une phrase

Système OSINT de cyber threat intelligence pour le ministère des Armées : collecte, qualifie et priorise des événements cyber **réels** (aucune donnée synthétique, à aucun niveau — code, tests, contenu généré par IA) à partir de sources ouvertes, et en tire un compte rendu de situation rédigé par IA.

- Repo : `git@github.com:bekri78/cyberWatch.git`, branches `main` (production) et `develop` (travail)
- Backend : Railway — `https://cyberwatch-production-7503.up.railway.app` (Node/TypeScript + Fastify + PostgreSQL)
- Frontend : GitHub Pages — `https://bekri78.github.io/cyberWatch/` (React + Tailwind/shadcn), consomme l'API Railway directement
- Règle non négociable : **jamais de données inventées**, dans aucune couche du projet. Travail toujours sur `develop`, jamais directement sur `main`.

## 2. Architecture actuelle (8 phases livrées)

**Pipeline** : collecte (7 sources) → promotion `raw_items → cyber_events` → classification déterministe → relecture IA (scoring) → catalogue public → compte rendu de situation IA.

| Phase | Contenu | État |
|---|---|---|
| 1–4 | Sources institutionnelles (CERT-FR, CISA KEV, Microsoft MSRC) + GDELT, pagination catalogue/sync, carte | ✅ en prod |
| 5 | Relecture IA (DeepSeek) des événements GDELT — filtrage faux positifs | ✅ remplacée par la 8 |
| 6 / 6.1 | Compte rendu de situation structuré rédigé par DeepSeek (à retenir, vulnérabilités, menaces/campagnes, OT/ICS, défense/spatial, tendances, points à surveiller) | ✅ en prod, tourne toutes les ~2h |
| 7 | Collecteur Google Actualités FR (2 flux bilingues : incidents `intitle:` + secteurs stratégiques) — comble le biais anglophone de GDELT sur l'actualité française | ✅ en prod |
| 8 | Scoring multicritère (0–25 sur 5 critères, paliers rejeté/conservé/veille/prioritaire) qui remplace le booléen `is_relevant` binaire, calculé **déterministiquement côté serveur** (jamais annoncé par le LLM lui-même) | ✅ en prod |
| 8→6.1 | Le score Phase 8 est transmis à DeepSeek comme signal supplémentaire dans la génération du compte rendu, avec instruction explicite de ne jamais le recopier tel quel comme sa propre criticité | ✅ en prod, vérifié (18 générations réussies depuis le déploiement) |

**Sources actives (7 enregistrées)** : CERT-FR, CISA KEV, Microsoft MSRC, GDELT, Google Actualités FR — plus **bleepingcomputer** et **hackernews**, qui sont seedées en base (table `sources`) mais **n'ont jamais eu de collecteur implémenté** → toujours 0 événement. Gap connu, signalé, jamais traité (en attente d'une décision : implémenter ou retirer).

## 3. État vérifié aujourd'hui (7 sept., via logs Railway + inspection du dépôt distant)

- **Backend** : déployé, sain. Scoring Phase 8 actif en production (derniers paliers observés en conditions réelles : ex. `{rejete:2, conserve:0, veille:7, prioritaire:16}`). Génération du compte rendu de situation réussie toutes les ~2h depuis le dernier déploiement (60 événements à chaque passage), avec le score Phase 8 bien intégré au prompt envoyé à DeepSeek.
- **Frontend** : la régression signalée hier (un commit qui avait accidentellement poussé une version périmée de `SituationReportPanel.tsx`, référençant un champ `keyPoints` disparu depuis la Phase 6.1, faisant échouer le build CI) est corrigée et déployée — le bundle en ligne correspond bien au build corrigé.
- **⚠️ Point d'attention non résolu** : le commit correctif a été poussé **directement sur `main`**, pas sur `develop`. Résultat : `develop` est aujourd'hui **en retard d'un commit** sur `main` et contient toujours la version cassée du fichier. Si le prochain travail repart de `develop` sans resynchroniser, le bug peut être réintroduit au prochain merge.
- `eventSchema.ts` (API publique `/api/v1/events` et `/api/v1/sync`) n'expose délibérément pas `scoreTotal`/`reviewTier` — décision de scope pour ne pas changer le contrat public, pas un oubli.

## 4. Plan — ce qu'il reste à faire

### Priorité immédiate (dette technique à corriger avant toute nouvelle feature)
1. **Resynchroniser `develop` sur `main`** : `git checkout develop && git merge main && git push origin develop` (fast-forward, aucun conflit attendu).
2. Vérifier que le workflow GitHub Actions passe au vert sur les deux branches après resynchronisation.
3. Vérifier qu'aucun autre écart de ce type n'existe ailleurs (comparer `main`/`develop` fichier par fichier si un doute subsiste).

### Décisions en attente (évoquées, jamais lancées sans confirmation explicite)
4. Ajouter CIRCL / URLhaus comme nouvelles sources de collecte.
5. Ajouter un 3ᵉ flux Google Actualités FR dédié « cyber géopolitique / APT / États ».
6. Trancher le sort de `bleepingcomputer`/`hackernews` : implémenter un collecteur réel, ou retirer ces entrées de la table `sources` pour ne pas afficher des compteurs à 0 trompeurs.
7. Travaux de fiabilité technique plus larges (monitoring, alerting sur échec de collecteur) — évoqués mais jamais scopés précisément.

### Suivi continu
8. Surveiller dans la durée que les paliers de scoring Phase 8 restent cohérents (pas de dérive du modèle).
9. Une fois un volume suffisant de données réelles accumulé, revisiter le réglage des requêtes Google Actualités FR (laissé volontairement `tel quel` en attendant ces données).

---

## 5. Prompt de reprise — à donner à une IA pour repartir avec le contexte complet

```
Tu reprends le projet CyberWatch, un système OSINT de cyber threat intelligence
réel destiné au ministère des Armées français. Voici le contexte complet.

REPO ET INFRASTRUCTURE
- Dépôt : git@github.com:bekri78/cyberWatch.git — deux branches : `main`
  (production, protégée) et `develop` (branche de travail).
- Backend : Node.js/TypeScript + Fastify + PostgreSQL, déployé sur Railway
  (https://cyberwatch-production-7503.up.railway.app), auto-déployé sur push
  vers `develop`.
- Frontend : React + Tailwind/shadcn, déployé sur GitHub Pages
  (https://bekri78.github.io/cyberWatch/), construit et publié via GitHub
  Actions sur push vers `main`. Le frontend appelle l'API Railway directement
  (pas de proxy).

RÈGLES NON NÉGOCIABLES
1. Aucune donnée inventée, nulle part : ni dans le code, ni dans les tests,
   ni dans le contenu généré par IA. Toute donnée de test doit provenir d'un
   échantillon réel (capture d'un vrai flux RSS/API, collée par l'utilisateur
   si l'IA ne peut pas atteindre la source elle-même).
2. Ne jamais travailler directement sur `main`. Toujours développer sur
   `develop`, merger vers `main` seulement une fois le travail vérifié
   (tsc --noEmit, vitest, build complet des deux paquets — backend et
   frontend/ — tous verts).
3. Travailler phase par phase, une fonctionnalité livrée et vérifiée à la
   fois plutôt que des refontes massives non scopées.
4. Avant de merger un correctif frontend ou backend sur `main`, toujours
   vérifier que `develop` et `main` restent synchronisés dans les DEUX sens
   (un correctif poussé sur l'un doit être reporté sur l'autre) — un écart
   non résolu a déjà causé une régression de build en production.

ARCHITECTURE DU PIPELINE
Collecteurs (répertoire src/collectors/, un par source, interface commune
`Collector { name, sourceType, collect() }`, enregistrés dans
src/jobs/scheduler.ts) → table `raw_items` → promotion déterministe vers
`cyber_events` (src/pipeline/promoteRawItems.ts) → classification déterministe
(catégorie, sévérité, tags — src/pipeline/classifyEvent.ts) → relecture IA
(DeepSeek) qui attribue un score multicritère 0-25 et un palier
(rejeté/conservé/veille/prioritaire), calculé DÉTERMINISTIQUEMENT côté
serveur à partir de 5 critères notés individuellement par le LLM (jamais de
total ou palier annoncé par le LLM lui-même, pour éviter toute
incohérence) → catalogue public via /api/v1/events et /api/v1/sync
(is_relevant=true uniquement, càd palier != 'rejeté') → génération
périodique (toutes les ~2h) d'un compte rendu de situation structuré par
DeepSeek (src/pipeline/generateSituationReport.ts), qui reçoit désormais le
score Phase 8 de chaque événement comme signal supplémentaire (pas une
vérité absolue — le prompt système lui interdit explicitement de recopier
ce palier comme sa propre criticité).

Sources actuellement actives avec un collecteur réel : CERT-FR, CISA KEV,
Microsoft MSRC, GDELT, Google Actualités FR (2 flux bilingues FR/EN :
un flux "incidents" à haute précision avec opérateur intitle:, un flux
"secteurs stratégiques" par correspondance contextuelle). Deux sources
(`bleepingcomputer`, `hackernews`) sont seedées en base mais n'ont jamais eu
de collecteur implémenté — gap connu, non résolu.

CE QUI EST DÉJÀ FAIT (8 phases livrées et vérifiées en production)
1-4. Sources institutionnelles + GDELT, pagination catalogue/sync, carte.
5. (Remplacée par la 8) Relecture IA binaire des événements GDELT.
6/6.1. Compte rendu de situation structuré (à retenir, vulnérabilités
   importantes, menaces/campagnes, OT/ICS, défense/spatial, tendances,
   points à surveiller) — jamais de section vide forcée, jamais d'événement
   inventé.
7. Collecteur Google Actualités FR — comble le biais anglophone du tagging
   thématique de GDELT sur l'actualité française.
8. Scoring multicritère remplaçant le booléen is_relevant, branché dans la
   génération du compte rendu de situation comme signal supplémentaire.

CE QU'IL RESTE À FAIRE (dans l'ordre de priorité)
1. URGENT : `develop` est actuellement en retard sur `main` d'un commit de
   correctif frontend — les resynchroniser avant tout nouveau travail
   (fast-forward `develop` sur `main`, vérifier que la CI passe des deux
   côtés).
2. Décisions en attente de confirmation utilisateur, ne rien lancer sans
   qu'elles soient explicitement demandées : ajout de CIRCL/URLhaus comme
   nouvelles sources ; ajout d'un 3e flux Google Actualités "cyber
   géopolitique/APT/États" ; sort de bleepingcomputer/hackernews
   (implémenter un collecteur ou retirer la source) ; travaux de fiabilité
   technique (monitoring, alerting sur échec de collecteur).
3. Suivi continu : cohérence des paliers de scoring dans la durée ; ajuster
   le réglage des requêtes Google Actualités FR une fois assez de données
   réelles de production accumulées (actuellement laissé "tel quel"
   volontairement).

Avant toute modification, lis le code existant pertinent (collecteurs,
pipeline, migrations) pour comprendre les conventions déjà établies plutôt
que d'en introduire de nouvelles. Chaque changement doit être vérifié
(type-check, tests, build complet) avant d'être livré.
```
