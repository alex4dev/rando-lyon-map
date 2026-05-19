# Randonnées sportives autour de Lyon

Carte interactive de 10 randonnées sportives accessibles depuis Lyon, avec traces GPX stockées dans le dépôt.

## Site

URL GitHub Pages prévue :

```text
https://alex4dev.github.io/rando-lyon-map/
```

## Contenu

- `index.html` : page principale.
- `src/app.js` : logique Leaflet, chargement GPX, sélection de randonnée, filtres.
- `src/styles.css` : UI du panneau, boutons, cartes et responsive.
- `data/hikes.json` : métadonnées des randonnées.
- `assets/gpx/` : traces GPX sources.
- `assets/img/og-rando-lyon.svg` : image de partage sociale simple.
- `.nojekyll` : évite toute transformation Jekyll, sert les assets tels quels.

## Publication GitHub Pages

Dans GitHub :

1. Ouvrir `Settings`.
2. Aller dans `Pages`.
3. Choisir `Deploy from a branch`.
4. Branch: `main`.
5. Folder: `/root`.
6. Enregistrer.

## Maintenance

Pour remplacer une randonnée :

1. Ajouter le nouveau GPX dans `assets/gpx/`.
2. Mettre à jour l'entrée correspondante dans `data/hikes.json`.
3. Vérifier le site en local avec un serveur statique, par exemple :

```bash
python3 -m http.server 8080
```

Puis ouvrir :

```text
http://localhost:8080
```

Ne pas ouvrir directement `index.html` en `file://`, car le navigateur peut bloquer les `fetch()` locaux des GPX.

## Notes randonnée

Certaines randonnées sont engagées. La carte est un outil de préparation, pas un dispositif de navigation sécurisé. Vérifier la météo, les arrêtés, la chasse et l'état des sentiers avant de partir.
