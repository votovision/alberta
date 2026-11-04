# alberta

Modèle de prévision des élections générales de l'Alberta (Votovision), adapté du modèle de la Colombie-Britannique (`votovision/bc`).

## Organisation

| Dossier | Contenu |
|---|---|
| `src/` | Moteur commun : tendance des sondages par processus gaussien en log-ratios isométriques, compositions, résumés de simulation. |
| `lib/` | Modèle de l'Alberta : swing par transfert avec présence des partis, régions (Calgary, Edmonton, reste), simulation des sièges ; choc systémique estimé avec les veilles de la C.-B. (`lib/veilles_bc.mjs`, dépôt `votovision/bc` cloné à côté). |
| `tools/` | Validation (transition 2019-2023) et prévision courante (`project_now.mjs`). |
| `ingest/` | Entrées du modèle tirées du dépôt de données `votovision/data`. |
| `data/` | Entrées et sorties du modèle (JSON). |

## Données d'Elections Alberta

Les conditions d'utilisation d'Elections Alberta interdisent de republier leurs données modifiées sans permission écrite. Les résultats par circonscription ne sont donc pas dans ce dépôt : `data/ab_riding_results.json` est ignoré par git. Pour les reconstituer, cloner `votovision/data` à côté, puis :

```
cd ../data
deno run --allow-read --allow-write --allow-net=www.elections.ab.ca sources/elections_alberta.ts              # téléchargement
deno run --allow-read --allow-write sources/elections_alberta.ts --formater                                    # raw/elections_alberta/resultats_<année>.csv
```

## Utilisation

```
npm install
npm run donnees                  # ../data -> data/*.json
node tools/eve_national.mjs      # tendance de veille de 2023
node tools/eve_simulation.mjs --couverture --mixte   # validation (en échantillon : une seule transition)
npm run projection               # prévision courante -> data/ab_dashboard.json
```

## Licence

GNU GPL v3 (`LICENSE`).
