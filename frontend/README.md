# CyberWatch — frontend

Page **Situation** : vue d'ensemble de la veille cyber, branchee directement
sur l'API reelle du backend Railway (`GET /api/v1/events`). Aucune donnee
simulee : posture, indicateurs et carte sont tous calcules a partir des
evenements reellement collectes.

- React + TypeScript + Vite
- Carte d’exploration : Leaflet + leaflet.markercluster, avec les réglages
  de regroupement d’OMGA (`bekri78/minitoring-cde`), fond CARTO Voyager et
  marqueurs placés sur les pays réellement cités (`countries[]`).
- Design repris de l'app de reference de l'utilisateur (palette, typographie
  Inter, composants panneau/badge/bouton), sans SharePoint et sans page admin

## Developpement local

```bash
npm install
npm run dev
```

Par defaut l'app appelle `https://cyberwatch-production-7503.up.railway.app`.
Pour cibler un autre backend (ex: local), creer `frontend/.env.local` :

```
VITE_API_BASE_URL=http://localhost:3000
```

### Fond de carte CARTO

Créer la variable `MAP_KEY` dans le service **backend Railway**, avec la vraie
clé CARTO Basemaps, puis redéployer le backend. En local, la même variable se
place dans le `.env` à la racine du projet (voir `.env.example`).

Le frontend charge `/api/v1/map/tiles/{z}/{x}/{y}.png` sur son backend ; celui-ci
appelle CARTO Voyager avec `MAP_KEY`. La clé n’est pas intégrée au bundle Vite
et sa rotation ne nécessite pas de reconstruire le frontend. Aucun
`VITE_MAP_KEY` n’est nécessaire. Une restriction de clé doit autoriser les
requêtes du serveur Railway, puisque les tuiles transitent par ce serveur.

Sans clé, le backend renvoie 503 et la carte affiche une erreur explicite ;
les marqueurs, les filtres et le flux restent utilisables. Le backend et le
frontend doivent tous deux être déployés pour activer cette route.

## Tests et verification

```bash
npm test        # vitest -- logique pure (posture, indicateurs, carte)
npx tsc -b       # verification des types
npm run build    # build de production (dist/)
```

## Deploiement (GitHub Pages)

Le workflow `.github/workflows/deploy-frontend.yml` build et publie
automatiquement `frontend/dist` sur GitHub Pages a chaque push sur `main`
qui touche `frontend/**`. Il faut activer Pages une seule fois :
**Settings → Pages → Source: GitHub Actions** sur le depot.

`vite.config.ts` fixe `base: '/cyberWatch/'` (page de projet, meme depot que
le backend) : a adapter si le frontend est publie depuis un depot different
ou avec un domaine personnalise.

## Prochaines etapes prevues

- Page **Assistant** (chat IA) — presente dans la barre laterale mais
  desactivee ("Bientot") tant qu'aucun backend ne l'alimente.
- Compte rendu redige automatiquement — pas d'endpoint backend pour
  l'instant ; la page l'indique honnetement plutot que d'afficher un texte
  invente (cf. `src/components/SummaryPlaceholder.tsx`).
