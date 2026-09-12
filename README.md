# CyberWatch

Backend de veille cyber automatisee.

CyberWatch collecte des informations cyber depuis plusieurs sources ouvertes,
les normalise, les deduplique, les enrichit, les analyse avec DeepSeek, les
stocke dans PostgreSQL et les expose via une API REST unique et structuree
(`/api/v1/sync`, `/api/v1/events`).

Ce depot ne contient pour l'instant que le scaffolding minimal. Le
developpement suit un ordre vertical strict (voir cahier des charges interne) :

1. Socle Fastify + TypeScript + `GET /api/v1/health`
2. Integration PostgreSQL
3. Un seul collecteur (CERT-FR), sans IA
4. `GET /api/v1/events` et `GET /api/v1/sync`
5. Integration DeepSeek
6. Ajout progressif des autres sources (CISA KEV, Microsoft, BleepingComputer,
   The Hacker News, MITRE ATT&CK) une par une

## Deploiement

Le service est deja connecte a Railway. L'application doit ecouter sur
`0.0.0.0:${PORT}` (`PORT` fourni par l'environnement, `3000` par defaut) et ne
doit jamais coder en dur son URL publique.

## Configuration

Variables d'environnement : voir `.env.example`. Ne jamais committer `.env`.

## Workflow Git

Le developpement se fait sur `develop`, jamais directement sur `main`.

## Localisation des publications

L'exploration affiche uniquement les publications qualifiées et localisables de
GDELT, Google Actualités et CERT-FR. Les autres données restent conservées en base.
Le sélecteur de période est dans le flux.

DeepSeek utilise `deepseek-flash` (V4.1 Flash, identifiant officiel vérifié le
12 septembre 2026, https://api-docs.deepseek.com/). La clé Railway
`DEEPSEEK_API_KEY` et l'URL API restent identiques. Le scoring et les comptes rendus
utilisent également cet identifiant.

À chaque cycle IA (démarrage, puis toutes les 15 minutes), jusqu'à 25 titres Google
et CERT-FR qualifiés, sans pays et datant des 30 derniers jours sont examinés.
L'IA propose uniquement des lieux de victimes explicitement cités dans le titre,
avec citation exacte. Le serveur valide les noms contre les référentiels locaux
GeoNames/world-countries ; il ne demande jamais de coordonnées au modèle.
Les villes ambiguës/inconnues et les titres sans lieu restent masqués dans
l'exploration. Le champ `locations` conserve précision, coordonnées de référence,
citation et provenance. Un lieu de ville est un centre de ville, pas une adresse.

La migration `014_title_locations.sql` s'applique au démarrage. Le rattrapage des
articles existants est progressif. Une extraction sans lieu n'est pas répétée ;
les échecs sont réessayés après une heure, trois tentatives maximum. Les positions
GDELT existantes ne sont pas remplacées. Attribution et licences du référentiel :
[src/lib/geo/README.md](src/lib/geo/README.md).

## Catégories et couleurs de l'exploration

DeepSeek classe le sujet principal du titre/extrait dans une catégorie validée :
cyberattaque (rouge), fuite de données (jaune), vulnérabilité (bleu), espionnage
(violet), menace/campagne (turquoise), autre/indéterminé (gris). Une publication
ambiguë reste neutre. La gravité reste indépendante, affichée sous forme de texte.
Le type historique « alerte » reste lisible en orange pendant son reclassement.
Les clusters mixtes utilisent des secteurs proportionnels aux types présents.

La migration 015 retire l'ancien défaut « attaque » des flux de presse.
Le cycle IA reclasse jusqu'à 25 publications qualifiées par passage, avec priorité
aux articles localisables des 30 derniers jours, et conserve une justification.
Il met à jour catégorie et tags sans changer gravité ou pertinence. Trois tentatives
maximum, espacées d'une heure en cas d'échec. Le traitement initial et les cycles
suivants reprennent aussi les articles déjà collectés.
