/**
 * Imports photos into the site.
 *
 * Point it at a folder of full-size photos and it will, for each one:
 *   1. shrink it to fit within 2000px (the largest size the site ever shows)
 *   2. strip every scrap of metadata, GPS location included
 *   3. optionally stamp a watermark on it
 *   4. write it into the right gallery folder
 *
 * Your original files are never modified, moved or deleted — only read.
 *
 * Usage:
 *   npm run import -- --from "D:\Photos\safari" --to animals
 *   npm run import -- --from "D:\Photos\wedding" --to people/events --watermark
 *   npm run import -- --from "D:\Photos\test" --to animals --dry
 */
import sharp from 'sharp';
import exifReader from 'exif-reader';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, extname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PHOTOS = join(ROOT, 'src', 'photos');
/** The hero photograph sits outside the galleries, so none of them contain it. */
const HERO = join(ROOT, 'src', 'hero');

/** Longest edge of the copies that get published. */
const MAX_EDGE = 2000;
/** JPEG quality of those copies. 88 is visually indistinguishable from the original. */
const QUALITY = 88;

const READABLE = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp']);
/** Formats sharp usually cannot open on Windows — flagged rather than skipped silently. */
const UNREADABLE = new Set(['.heic', '.heif', '.cr2', '.cr3', '.nef', '.arw', '.raf', '.dng', '.orf']);

// ---------------------------------------------------------------- arguments
function parseArgs(argv) {
  const args = { watermark: false, dry: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--from') args.from = argv[++i];
    else if (a === '--to') args.to = argv[++i];
    else if (a === '--watermark') args.watermark = true;
    else if (a === '--dry') args.dry = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

async function knownGalleries() {
  const found = [];
  async function walk(dir, parts) {
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const subdirs = entries.filter((e) => e.isDirectory());
    if (!subdirs.length && parts.length) {
      found.push(parts.join('/'));
      return;
    }
    for (const d of subdirs) await walk(join(dir, d.name), [...parts, d.name]);
  }
  await walk(PHOTOS, []);
  return found.sort();
}

function usage(galleries) {
  console.log(`
Import photos into the site.

  npm run import -- --from "<folder of photos>" --to <gallery>

Options
  --from <folder>   Folder holding the photos to import (read only — never changed)
  --to <gallery>    Which gallery they belong to, or "hero" for the front-page photo
  --watermark       Stamp a small signature in the corner
  --dry             Show what would happen without writing anything

Galleries
${galleries.map((g) => `  ${g}`).join('\n')}
  hero                (not a gallery — the single front-page photograph)

Examples
  npm run import -- --from "D:\\Photos\\safari" --to animals
  npm run import -- --from "D:\\Photos\\wedding" --to people/events --watermark
  npm run import -- --from "D:\\Photos\\chosen" --to hero
`);
}

// --------------------------------------------------------------- watermark
/**
 * A restrained signature in the bottom-right. Sized relative to the photo so
 * it looks the same on a wide landscape shot and a tall portrait one.
 */
function watermarkSvg(width, height, text) {
  const fontSize = Math.round(Math.min(width, height) * 0.022);
  const pad = Math.round(fontSize * 1.6);
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <text x="${width - pad}" y="${height - pad}"
      text-anchor="end"
      font-family="Helvetica, Arial, sans-serif"
      font-size="${fontSize}"
      letter-spacing="${fontSize * 0.12}"
      fill="#ffffff" fill-opacity="0.62">${text}</text>
  </svg>`);
}

// -------------------------------------------------------------------- exif
/**
 * Pulls the shooting details out of a photo's EXIF before the image is
 * stripped.
 *
 * This is the whole reason the settings survive at all: the published copy has
 * every tag removed so no GPS location escapes, which also destroys the camera
 * settings. So they are read here and written to a small `_meta.json` beside
 * the photos, and the site reads that instead of the image.
 *
 * Location tags are deliberately not read. They are not wanted, and anything
 * not read cannot be written out by accident.
 */
function readShootingDetails(exifBuffer) {
  if (!exifBuffer) return null;

  let tags;
  try {
    tags = exifReader(exifBuffer);
  } catch {
    return null;
  }

  const image = tags.Image ?? {};
  const photo = tags.Photo ?? {};

  // Model usually already contains the manufacturer ("NIKON Z 6"), so only
  // prefix the make when it does not.
  const make = typeof image.Make === 'string' ? image.Make.trim() : '';
  const model = typeof image.Model === 'string' ? image.Model.trim() : '';
  let camera = model;
  if (make && model && !model.toLowerCase().startsWith(make.toLowerCase().split(' ')[0])) {
    camera = `${make} ${model}`;
  }
  if (!camera && make) camera = make;

  const iso = Array.isArray(photo.ISOSpeedRatings)
    ? photo.ISOSpeedRatings[0]
    : photo.ISOSpeedRatings ?? photo.PhotographicSensitivity;

  const shutter = (() => {
    const t = photo.ExposureTime;
    if (typeof t !== 'number' || t <= 0) return null;
    // Photographers read fast shutters as fractions and slow ones as seconds.
    return t >= 1 ? `${Number(t.toFixed(1))}s` : `1/${Math.round(1 / t)}s`;
  })();

  const taken = photo.DateTimeOriginal ?? photo.DateTimeDigitized ?? image.DateTime;
  const year = taken instanceof Date && !Number.isNaN(taken.valueOf())
    ? taken.getUTCFullYear()
    : null;

  const details = {
    camera: camera || null,
    lens: typeof photo.LensModel === 'string' ? photo.LensModel.trim() : null,
    focal: typeof photo.FocalLength === 'number' ? `${Math.round(photo.FocalLength)}mm` : null,
    aperture: typeof photo.FNumber === 'number' ? `f/${Number(photo.FNumber.toFixed(1))}` : null,
    shutter,
    iso: typeof iso === 'number' ? `ISO ${iso}` : null,
    year,
  };

  // Nothing useful found — better to store nothing than a row of blanks.
  return Object.values(details).some(Boolean) ? details : null;
}

// ------------------------------------------------------------------- names
/** IMG_4821.JPG -> img-4821 ; "Golden Hour 3.jpg" -> golden-hour-3 */
function slugify(name) {
  return basename(name, extname(name))
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'photo';
}

// -------------------------------------------------------------------- main
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const galleries = await knownGalleries();

  if (args.help || !args.from || !args.to) {
    usage(galleries);
    process.exit(args.help ? 0 : 1);
  }

  const from = resolve(args.from);
  if (!existsSync(from)) {
    console.error(`\nThat folder does not exist:\n  ${from}\n`);
    process.exit(1);
  }

  // "hero" is not a gallery. It is a single photograph belonging to no
  // category, so it lives outside src/photos where the galleries cannot see
  // it, and importing one replaces the previous rather than adding to it.
  const isHero = args.to.toLowerCase() === 'hero';
  const target = isHero ? HERO : join(PHOTOS, ...args.to.split(/[/\\]/));

  if (!isHero && !galleries.includes(args.to.replace(/\\/g, '/'))) {
    console.log(`\nNote: "${args.to}" is not one of the existing galleries.`);
    console.log(`It will be created. Existing ones are:\n${galleries.map((g) => `  ${g}`).join('\n')}\n`);
  }

  const entries = await readdir(from, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile()).map((e) => e.name);

  const usable = files.filter((f) => READABLE.has(extname(f).toLowerCase()));
  const unusable = files.filter((f) => UNREADABLE.has(extname(f).toLowerCase()));

  if (unusable.length) {
    console.log(`\n${unusable.length} file(s) are in a format this tool cannot open`);
    console.log(`(RAW or HEIC — e.g. ${unusable.slice(0, 3).join(', ')}).`);
    console.log(`Export them as JPEG from your photo software first, then run this again.\n`);
  }

  if (!usable.length) {
    console.error('No importable photos found in that folder.\n');
    process.exit(1);
  }

  // There is exactly one hero. Rather than silently picking one of several,
  // say so and stop — the wrong photograph on the front page is worse than an
  // error message.
  if (isHero && usable.length > 1) {
    console.error(`\nThe hero is a single photograph, but that folder holds ${usable.length}:`);
    usable.slice(0, 8).forEach((f) => console.error(`  ${f}`));
    if (usable.length > 8) console.error(`  …and ${usable.length - 8} more`);
    console.error('\nPoint --from at a folder holding just the one you want.\n');
    process.exit(1);
  }

  // Replacing the hero, not adding to it.
  if (isHero && !args.dry && existsSync(target)) {
    for (const old of await readdir(target)) {
      if (/\.(jpe?g|png|webp|avif)$/i.test(old)) {
        await rm(join(target, old));
        console.log(`  replacing previous hero: ${old}`);
      }
    }
  }

  console.log(`\n${usable.length} photo(s) → ${isHero ? 'the hero' : args.to}`);
  console.log(`Shrinking to ${MAX_EDGE}px, removing all metadata including GPS${args.watermark ? ', adding watermark' : ''}.`);
  if (args.dry) console.log('DRY RUN — nothing will be written.');
  console.log('');

  if (!args.dry) await mkdir(target, { recursive: true });

  // Existing sidecar is merged into, not replaced, so importing a second batch
  // into the same gallery does not wipe the first batch's details.
  const metaPath = join(target, '_meta.json');
  let sidecar = {};
  if (existsSync(metaPath)) {
    try {
      sidecar = JSON.parse(await readFile(metaPath, 'utf8'));
    } catch {
      console.log('  (existing _meta.json was unreadable — starting a fresh one)');
    }
  }

  let totalIn = 0;
  let totalOut = 0;
  let done = 0;
  let hadGps = 0;
  let withDetails = 0;

  for (const file of usable) {
    const source = join(from, file);
    const info = await stat(source);
    totalIn += info.size;

    const image = sharp(source, { failOn: 'none' });
    const meta = await image.metadata();

    // Read the shooting details BEFORE the image is written, because writing
    // it strips every tag. sharp drops all metadata unless explicitly told to
    // keep it, so simply not calling withMetadata() is what removes the GPS.
    const details = readShootingDetails(meta.exif);
    if (meta.exif) hadGps += 1;
    if (details) withDetails += 1;

    const landscape = (meta.width ?? 0) >= (meta.height ?? 0);
    const resized = image
      .rotate() // honour the camera's orientation flag before it is stripped
      .resize({
        width: landscape ? MAX_EDGE : undefined,
        height: landscape ? undefined : MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      });

    let pipeline = resized;

    if (args.watermark) {
      // The watermark has to match the *output* size, so measure after resize.
      const buf = await resized.jpeg({ quality: QUALITY }).toBuffer();
      const out = await sharp(buf).metadata();
      pipeline = sharp(buf).composite([
        { input: watermarkSvg(out.width, out.height, 'HUSSEIN YAZBECK'), top: 0, left: 0 },
      ]);
    }

    const outName = `${slugify(file)}.jpg`;
    const outPath = join(target, outName);
    const outBuf = await pipeline.jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer();
    totalOut += outBuf.length;

    if (details) sidecar[outName] = details;
    else delete sidecar[outName];

    if (!args.dry) await writeFile(outPath, outBuf);

    done += 1;
    const mbIn = (info.size / 1024 / 1024).toFixed(1);
    const mbOut = (outBuf.length / 1024 / 1024).toFixed(2);
    console.log(`  ${String(done).padStart(3)}. ${file}  ${mbIn}MB → ${outName}  ${mbOut}MB`);
  }

  if (!isHero && !args.dry && Object.keys(sidecar).length) {
    await writeFile(metaPath, `${JSON.stringify(sidecar, null, 2)}\n`, 'utf8');
  }

  const pct = totalIn ? Math.round((1 - totalOut / totalIn) * 100) : 0;
  console.log(`\n${done} photo(s) ${args.dry ? 'would be imported' : 'imported'}.`);
  if (!isHero) {
    console.log(`  Camera settings kept for ${withDetails} photo(s) — shown under each photo full screen.`);
  }
  console.log(`  ${(totalIn / 1024 / 1024).toFixed(0)}MB of originals → ${(totalOut / 1024 / 1024).toFixed(0)}MB published (${pct}% smaller)`);
  console.log(`  Metadata stripped from ${hadGps} file(s) that carried it — no GPS location is published.`);
  console.log(`  Your original files were not touched.`);

  if (isHero) {
    console.log(`\nThat is now the front-page photograph. It belongs to no gallery,`);
    console.log(`is not counted in any category, and importing another replaces it.`);
  } else {
    console.log(`\nFilenames become the captions on the site:`);
    console.log(`  golden-hour-ridge.jpg  ->  "Golden hour ridge"`);
    console.log(`Rename files in src/photos/${args.to}/ if you want nicer captions.`);
  }
  console.log(`\nNext:  npm run build\n`);
}

main().catch((err) => {
  console.error('\nSomething went wrong:\n', err.message, '\n');
  process.exit(1);
});
