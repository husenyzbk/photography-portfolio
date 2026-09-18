// @ts-check
import { defineConfig } from 'astro/config';

/**
 * Static output, deployed to GitHub Pages.
 *
 * `site` + `base` are the only two values tied to the current hosting. Moving
 * to a bought domain later means setting site to the new origin and base to
 * '/', and changing the matching pair in src/consts.ts — no other edits.
 */
export default defineConfig({
  site: 'https://husenyzbk.github.io',
  base: '/photography-portfolio',
  trailingSlash: 'always',
  output: 'static',
  build: {
    // Emit /animals/index.html rather than /animals.html, so URLs are clean
    // and folder-based on any static host.
    format: 'directory',
    inlineStylesheets: 'auto',
  },
  image: {
    // Sharp handles the resizing at build time. Nothing is processed at
    // request time, so hosting stays free and static.
    service: { entrypoint: 'astro/assets/services/sharp' },
  },
  compressHTML: true,
});
