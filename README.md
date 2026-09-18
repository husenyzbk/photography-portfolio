# Photography portfolio

A static photography site. No server, no database, no monthly bill — it builds
to plain HTML and images and is served from a CDN.

## Adding photos

Drop image files into the folder for the gallery:

```
src/photos/
  animals/
  people/events/
  people/portraits/
  outdoors/street-photography/
  outdoors/miscellaneous/
```

That is the whole process. There is no list to update — every image in those
folders is picked up automatically, and the filename becomes the caption
(`golden-hour-ridge.jpg` → "Golden hour ridge"), so name files descriptively.

Photos are ordered alphabetically by filename. Prefixing with numbers
(`01-`, `02-`) gives you explicit control over the running order.

Then:

```bash
npm run build
```

### Originals

Put full-resolution originals in `_originals/` if you want them alongside the
project — that folder is gitignored and never deployed. Only the optimised
derivatives in `dist/` are published.

## What happens to a photo at build time

Each source image is resized into several widths and encoded as AVIF, WebP and
JPEG. The browser picks the smallest file that suits its screen, so a phone
downloads roughly 25–60 KB per photo rather than the multi-megabyte original.
Nothing is processed at request time; it all happens during `npm run build`.

Source images are never served.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server with live reload |
| `npm run build` | Builds the site into `dist/` |
| `npm run preview` | Serves the built `dist/` exactly as it will deploy |
| `npm run placeholders` | Regenerates stand-in images (`-- --clean` to replace) |

## Adding or renaming a gallery

Edit `src/consts.ts`. The category tree there drives the navigation, the
homepage cards and the URLs — adding an entry creates its page automatically.
Create the matching folder under `src/photos/` and add photos.

## Moving to a custom domain

Two values change, both already isolated:

1. `src/consts.ts` → `SITE.url` and `SITE.base`
2. `astro.config.mjs` → `site` and `base`

For a domain at the root, `base` becomes `'/'`. Nothing else needs editing —
internal links are built through `src/lib/url.ts`, which respects the base path.

## Structure

```
src/
  consts.ts          Site config + the category tree
  lib/photos.ts      Finds every image and attaches its metadata
  lib/layout.ts      Groups photos into justified rows at build time
  lib/url.ts         Base-path-aware link builder
  components/        Nav, footer, photo grid, lightbox, category card
  pages/             index.astro and the catch-all category route
  photos/            Source images, by category
```

## Notes on the front end

- Zero JavaScript frameworks. The only script shipped is Astro's page router
  (~15 KB) plus small inline handlers for the lightbox and scroll reveals.
- Animations only ever touch `transform` and `opacity`, which the compositor
  handles without re-running layout — that is what keeps them at 60fps on a
  phone. All motion is disabled under `prefers-reduced-motion`.
- Rows are justified at build time from known aspect ratios, so the gallery
  does not shift around as images load.
