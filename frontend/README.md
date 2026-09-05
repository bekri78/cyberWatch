# CyberWatch — frontend

Page **Situation** : vue d'ensemble de la veille cyber, branchee directement
sur l'API reelle du backend Railway (`GET /api/v1/events`). Aucune donnee
simulee : posture, indicateurs et carte sont tous calcules a partir des
evenements reellement collectes.

- React + TypeScript + Vite
- Carte du monde : Leaflet + tuiles sombres CARTO (Dark Matter), marqueurs
  places sur les pays reellement cites par GDELT (`countries[]`)
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
