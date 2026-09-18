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
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, extname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PHOTOS = join(ROOT, 'src', 'photos');

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
  --to <gallery>    Which gallery they belong to
  --watermark       Stamp a small signature in the corner
  --dry             Show what would happen without writing anything

Galleries
${galleries.map((g) => `  ${g}`).join('\n')}

Examples
  npm run import -- --from "D:\\Photos\\safari" --to animals
  npm run import -- --from "D:\\Photos\\wedding" --to people/events --watermark
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

  const target = join(PHOTOS, ...args.to.split(/[/\\]/));
  if (!galleries.includes(args.to.replace(/\\/g, '/'))) {
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

  console.log(`\n${usable.length} photo(s) → ${args.to}`);
  console.log(`Shrinking to ${MAX_EDGE}px, removing all metadata including GPS${args.watermark ? ', adding watermark' : ''}.`);
  if (args.dry) console.log('DRY RUN — nothing will be written.');
  console.log('');

  if (!args.dry) await mkdir(target, { recursive: true });

  let totalIn = 0;
  let totalOut = 0;
  let done = 0;
  let hadGps = 0;

  for (const file of usable) {
    const source = join(from, file);
    const info = await stat(source);
    totalIn += info.size;

    const image = sharp(source, { failOn: 'none' });
    const meta = await image.metadata();

    // sharp drops all metadata unless explicitly told to keep it, so simply
    // not calling withMetadata() is what removes the GPS tag.
    if (meta.exif) hadGps += 1;

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

    if (!args.dry) await writeFile(outPath, outBuf);

    done += 1;
    const mbIn = (info.size / 1024 / 1024).toFixed(1);
    const mbOut = (outBuf.length / 1024 / 1024).toFixed(2);
    console.log(`  ${String(done).padStart(3)}. ${file}  ${mbIn}MB → ${outName}  ${mbOut}MB`);
  }

  const pct = totalIn ? Math.round((1 - totalOut / totalIn) * 100) : 0;
  console.log(`\n${done} photo(s) ${args.dry ? 'would be imported' : 'imported'}.`);
  console.log(`  ${(totalIn / 1024 / 1024).toFixed(0)}MB of originals → ${(totalOut / 1024 / 1024).toFixed(0)}MB published (${pct}% smaller)`);
  console.log(`  Metadata stripped from ${hadGps} file(s) that carried it — no GPS location is published.`);
  console.log(`  Your original files were not touched.`);

  console.log(`\nFilenames become the captions on the site:`);
  console.log(`  01-heron-at-dawn.jpg  ->  "01 heron at dawn"`);
  console.log(`Rename files in src/photos/${args.to}/ if you want nicer captions.`);
  console.log(`\nNext:  npm run build\n`);
}

main().catch((err) => {
  console.error('\nSomething went wrong:\n', err.message, '\n');
  process.exit(1);
});
