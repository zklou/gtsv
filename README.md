# Unit 503-1705 sensing van

Interactive review page for the planned buildout of a 2026 Ford Transit-350.
The front roof object is an auxiliary A/C; the sensing equipment is at the rear.
The **Our sheet** and **PathRunner** switches show a simplified sheet layout and a
photo-based reference frame. Equipment shapes and mounting heights are conceptual.

## Develop

```sh
npm ci
npm run dev
npm run build
```

The Umi 4 / React page is in `src/pages/index.tsx`; the Three.js model is in
`src/components/VanScene.tsx`. The compiled static site is in `dist/`.

## GitHub Pages

The production build uses `/gtsv/` as its route and asset prefix. A push to
`main` runs `.github/workflows/pages.yml`, which builds and deploys `dist/` to
GitHub Pages. Repository Settings → Pages must use **GitHub Actions** as its source.
The resulting URL is `https://zklou.github.io/gtsv/`.

Custom points placed in the viewer are saved in the current browser. Use
**Copy link with points** to give someone a URL that carries the points in its
query string. This is suitable for a small number of points; there is no shared
database or sign-in.

The source sheets under `public/sheets/` and the VIN shown on the page are
published as part of the site. The original camera files and previous prototype
are excluded from the repository.
