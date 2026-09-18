/**
 * Generates stand-in images so the site can be built and reviewed before the
 * real photographs arrive.
 *
 * These are abstract gradients, not fake photos — the point is to exercise the
 * layout with realistic dimensions and a realistic mix of aspect ratios.
 *
 *   npm run placeholders
 *
 * Delete src/photos/** and drop the real photos in the same folders when they
 * are ready; nothing else needs changing.
 */
import sharp from 'sharp';
import { mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PHOTOS = join(ROOT, 'src', 'photos');

/** Aspect ratios a camera actually produces, cycled through for variety. */
const SHAPES = [
  { w: 3600, h: 2400 }, // 3:2 landscape
  { w: 2400, h: 3600 }, // 2:3 portrait
  { w: 3600, h: 2025 }, // 16:9
  { w: 2800, h: 2800 }, // square
  { w: 3600, h: 2400 },
  { w: 2400, h: 3000 }, // 4:5
];

/** A palette per gallery, so the categories are visually distinguishable. */
const GALLERIES = [
  {
    path: ['animals'],
    hues: [[28, 62, 38], [140, 48, 30], [52, 40, 46]],
    names: ['heron at dawn', 'fox in frost', 'stray cat', 'horses turning',
            'gull over surf', 'deer at treeline', 'beetle on slate', 'owl at dusk'],
  },
  {
    path: ['people', 'events'],
    hues: [[340, 55, 42], [12, 60, 45], [280, 35, 38]],
    names: ['first dance', 'the toast', 'backstage', 'crowd at midnight',
            'confetti', 'the procession', 'last song'],
  },
  {
    path: ['people', 'portraits'],
    hues: [[24, 38, 44], [200, 25, 40], [340, 30, 46]],
    names: ['amal in window light', 'studio no 4', 'hands and coffee',
            'against the wall', 'laughing', 'profile in shade', 'the painter'],
  },
  {
    path: ['outdoors', 'street-photography'],
    hues: [[210, 40, 34], [45, 45, 42], [0, 0, 36]],
    names: ['crossing at rush hour', 'neon and rain', 'bus window',
            'market morning', 'the newsstand', 'umbrella', 'alley cat',
            'tram stop'],
  },
  {
    path: ['outdoors', 'miscellaneous'],
    hues: [[190, 45, 40], [110, 40, 36], [30, 50, 44]],
    names: ['ridge at golden hour', 'fog in the valley', 'tide pools',
            'pine and granite', 'the long road', 'storm building'],
  },
];

/**
 * Builds an SVG of layered radial gradients plus a turbulence grain overlay.
 * Grain matters: a perfectly smooth gradient compresses to almost nothing and
 * would give a misleadingly rosy picture of the image pipeline.
 */
function makeSvg(w, h, hues, seed) {
  const [h1, s1, l1] = hues[0];
  const [h2, s2, l2] = hues[1];
  const [h3, s3, l3] = hues[2];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${h1} ${s1}% ${l1}%)"/>
      <stop offset="55%" stop-color="hsl(${h2} ${s2}% ${l2}%)"/>
      <stop offset="100%" stop-color="hsl(${h3} ${s3}% ${Math.max(8, l3 - 22)}%)"/>
    </linearGradient>
    <radialGradient id="glow" cx="${28 + (seed % 5) * 11}%" cy="${22 + (seed % 3) * 18}%" r="62%">
      <stop offset="0%" stop-color="hsl(${(h1 + 30) % 360} ${s1}% ${Math.min(78, l1 + 30)}%)" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="hsl(${h1} ${s1}% ${l1}%)" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="shade" cx="50%" cy="50%" r="78%">
      <stop offset="55%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.5"/>
    </radialGradient>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="${seed}"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>
  </defs>

  <rect width="100%" height="100%" fill="url(#base)"/>
  <rect width="100%" height="100%" fill="url(#glow)"/>
  <rect width="100%" height="100%" filter="url(#grain)" opacity="0.14"/>
  <rect width="100%" height="100%" fill="url(#shade)"/>
</svg>`;
}

const slug = (s) => s.replace(/\s+/g, '-').toLowerCase();

async function main() {
  const fresh = process.argv.includes('--clean');
  let made = 0;

  for (const gallery of GALLERIES) {
    const dir = join(PHOTOS, ...gallery.path);

    if (fresh && existsSync(dir)) {
      await rm(dir, { recursive: true, force: true });
    }
    await mkdir(dir, { recursive: true });

    const existing = existsSync(dir) ? await readdir(dir) : [];
    if (existing.length && !fresh) {
      console.log(`  skip  ${gallery.path.join('/')} (${existing.length} files already there)`);
      continue;
    }

    for (const [i, name] of gallery.names.entries()) {
      const shape = SHAPES[i % SHAPES.length];
      const svg = makeSvg(shape.w, shape.h, gallery.hues, i + gallery.path.length * 7);
      const file = join(dir, `${String(i + 1).padStart(2, '0')}-${slug(name)}.jpg`);

      const buf = await sharp(Buffer.from(svg))
        .jpeg({ quality: 92, mozjpeg: true })
        .toBuffer();

      await writeFile(file, buf);
      made += 1;
      process.stdout.write(
        `  made  ${gallery.path.join('/')}/${String(i + 1).padStart(2, '0')}-${slug(name)}.jpg ` +
          `${shape.w}x${shape.h} ${(buf.length / 1024 / 1024).toFixed(1)}MB\n`,
      );
    }
  }

  console.log(`\n${made} placeholder image${made === 1 ? '' : 's'} written to src/photos/`);
  if (!made) console.log('Nothing to do — pass --clean to regenerate.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
