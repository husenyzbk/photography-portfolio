# Photography portfolio

A static photography site. No server, no database, no monthly bill — it builds
to plain HTML and images and is served from a CDN.

## Adding photos

Point the import tool at a folder of photos and say which gallery they belong
to:

```bash
npm run import -- --from "D:\Photos\safari" --to animals
npm run build
```

For each photo it makes a web-ready copy: shrunk to fit 2000px, **all metadata
removed including the GPS coordinates your camera writes into every file**, and
filed into the right gallery. Your originals are read but never modified,
moved or deleted.

| Option | What it does |
| --- | --- |
| `--from <folder>` | Where your photos are |
| `--to <gallery>` | `animals`, `people/events`, `people/portraits`, `outdoors/street-photography`, `outdoors/miscellaneous` |
| `--dry` | Show what would happen without writing anything |
| `--watermark` | Stamp a signature in the corner |

Run `npm run import` with no arguments to see the list of galleries.

RAW and HEIC files cannot be read directly — export them as JPEG from your
photo software first. The tool tells you if it finds any.

### Captions and ordering

The filename becomes the caption (`golden-hour-ridge.jpg` → "Golden hour
ridge"), so rename files in `src/photos/<gallery>/` if `IMG_4821` is not what
you want under a photo. Photos are ordered alphabetically; prefixing with
numbers (`01-`, `02-`) gives you explicit control over the running order.

### Originals

Keep your full-resolution originals wherever you normally keep them — an
external drive, a Lightroom catalog, a backup. They do not belong in this
project, and git is genuinely bad at storing them: it keeps every version of
every file forever.

`_originals/` is available as a scratch folder if you want them alongside the
project. It is gitignored and never deployed.

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
