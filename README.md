# JobBoard — agrégateur d'offres freelance & CDI

Plateforme locale qui agrège les offres d'emploi **freelance et CDI** pour les technos **JavaScript, React, PHP, Node.js et .NET**, avec :

- un bouton **Actualiser** qui interroge toutes les plateformes (chacune isolée : une source en panne n'empêche pas les autres) ;
- des **filtres** : technos, type de contrat, lieu (France / full remote), télétravail, période, source, statut de suivi, favoris, recherche libre ;
- une **fiche détaillée** par offre (description, contrat, technos, dates, doublons repérés sur d'autres plateformes) avec **lien direct vers l'offre** ;
- la **rémunération structurée** : **TJM** (€/jour) pour le freelance et **salaire annuel** pour le CDI, extraits des données des plateformes ou du texte de l'offre (« TJM 550 », « 500-600 €/jour », « 45-55k€ », « 3 400 € brut / mois »…), avec filtres « TJM minimum » / « salaire minimum », tri par rémunération et médianes affichées ;
- un **suivi de candidatures** : statut (nouveau, vu, à postuler, candidature envoyée, relancé, entretien, offre reçue, refus, ignoré), notes personnelles, favoris, tableau « Mon suivi » ;
- le marquage **« Nouveau »** des offres apparues depuis la dernière actualisation, pour une consultation quotidienne ;
- une page **Sources** avec l'état de chaque connecteur et des liens de recherche pré-remplis vers les plateformes sans API exploitable.

## Démarrage

Pré-requis : Node.js ≥ 22.13 (SQLite natif via `node:sqlite`).

```bash
npm install
cp .env.example .env      # optionnel : clés API, réglages
npm run build             # construit le front (client/dist)
npm start                 # http://localhost:3000
```

En développement (rechargement à chaud du serveur et du front sur http://localhost:5173) :

```bash
npm run dev
```

Autres commandes :

```bash
npm test                          # tests unitaires (normalisation, actualisation, filtres)
npm run refresh                   # actualisation en ligne de commande (pratique dans un cron)
npm run refresh -- freework,wttj  # uniquement certaines sources
```

Les données sont stockées dans `data/jobboard.sqlite` (modifiable via `DB_PATH`).

## Sources interrogées

| Source | Type | Périmètre | Remarques |
| --- | --- | --- | --- |
| Free-Work | API JSON du site | Freelance + CDI IT France | Descriptions complètes, TJM / salaire |
| LinkedIn | Endpoint public « guest » (HTML) | CDI (`f_JT=F`) et contrat/freelance (`f_JT=C`), France, 7 derniers jours | Quotas stricts : `LINKEDIN_PAGES=1` par défaut, description récupérée pour les nouvelles offres seulement (`DETAIL_FETCH_LIMIT`). Un 429 rend le résultat partiel, réessayer plus tard |
| Welcome to the Jungle | Index Algolia public du site + API détail | France + full remote | Clés Algolia surchargables dans `.env` si elles changent |
| APEC | Webservice JSON du site | Cadres, CDI/CDD | |
| HelloWork | Pages HTML de recherche | CDI/CDD/freelance | Extraction tolérante (JSON-LD puis liens) ; peut casser si le site change |
| France Travail | API officielle v2 | Toutes offres France | Identifiants gratuits sur francetravail.io |
| Adzuna | API officielle | Agrégateur (Indeed-like) | Identifiants gratuits sur developer.adzuna.com |
| Jooble | API officielle | Agrégateur | Clé gratuite sur demande |
| Remotive, Arbeitnow, Jobicy, Remote OK, Himalayas, We Work Remotely, The Muse | API / RSS publiques | Offres remote / Europe | Filtrées ensuite par technos |
| Hacker News « Who is hiring? » | API Algolia HN | Annonces mentionnant France / remote | |

Plateformes sans API exploitable (anti-bot ou connexion obligatoire) — Indeed, Malt, Comet, Glassdoor, JobTeaser, Monster, Cadremploi, LesJeudis, ChooseYourBoss, Talent.com, Codeur, Freelance-Informatique — sont accessibles via des **liens de recherche pré-remplis** dans l'onglet Sources.

Les sources sont désactivables via `DISABLED_SOURCES=hellowork,hackernews`.

## Fonctionnement

1. Chaque connecteur (`server/connectors/*.js`) interroge sa plateforme avec les mots-clés de chaque techno et renvoie des offres brutes.
2. `server/normalize.js` nettoie le HTML, détecte les technos (regex sur titre + description + tags), infère le contrat (freelance / CDI / CDD…), le télétravail et le pays. Les offres qui ne mentionnent aucune des cinq technos sont écartées. `server/compensation.js` extrait le TJM et le salaire annuel (les valeurs structurées fournies par la plateforme priment sur le texte ; un salaire mensuel est ramené à l'année ; les montants en $ ou £ conservent leur devise).
3. `server/db.js` insère les nouvelles offres (rattachées à l'actualisation qui les a découvertes) et met à jour les autres sans toucher au suivi (statut, notes, favori).
4. Le front (`client/`, React + Vite) consomme l'API `/api/*` et affiche listes, filtres, fiche détaillée, tableau de suivi et état des sources.

Une offre non revue depuis 7 jours est signalée « peut-être retirée » (filtre « Masquer les offres disparues »). Ouvrir une fiche fait passer automatiquement une offre « Nouveau » en « Vu ».

## Actualisation automatique

- `REFRESH_ON_START=true` : actualisation au démarrage du serveur.
- `AUTO_REFRESH_MINUTES=120` : actualisation périodique.
- Ou un cron système : `0 8 * * * cd /chemin/jobboard && npm run refresh`.

## API

| Méthode | Route | Description |
| --- | --- | --- |
| GET | `/api/jobs?techs=react,php&contracts=freelance&country=FR_OR_REMOTE&sinceDays=7&q=symfony&onlyNew=1&tjmMin=500&salaryMin=45000&withPay=1&sort=tjm` | Liste filtrée (tri : `published`, `seen`, `status`, `tjm`, `salary`) |
| GET | `/api/jobs/:id` | Détail + doublons sur d'autres sources |
| PATCH | `/api/jobs/:id` | `{ status, notes, favorite }` |
| POST | `/api/refresh` | Lance une actualisation (`{ only: "freework,wttj" }` optionnel) |
| GET | `/api/refresh/status` | Progression en cours |
| GET | `/api/sources` | État des connecteurs |
| GET | `/api/stats` | Compteurs (technos, contrats, statuts, nouveautés) |
| GET | `/api/manual-links?tech=react&contract=freelance` | Liens de recherche manuels |

## Limites connues

- Les endpoints non officiels (LinkedIn, WTTJ, APEC, HelloWork, Free-Work) peuvent changer sans préavis ; l'onglet Sources affiche l'erreur exacte pour faciliter la correction du connecteur concerné.
- LinkedIn limite fortement les requêtes anonymes ; ne pas lancer d'actualisation en boucle.
- La détection des technos repose sur le texte de l'offre : une description tronquée peut faire manquer une techno (ou l'offre si aucune techno n'est détectée).
