import type { ImageMetadata } from 'astro';

/**
 * Shooting details, as captured by the import tool.
 *
 * These live in a `_meta.json` beside the photos rather than inside the image
 * files, because the published copies have every tag stripped so no GPS
 * location can escape with them.
 */
export type ShootingDetails = {
  camera?: string | null;
  lens?: string | null;
  focal?: string | null;
  aperture?: string | null;
  shutter?: string | null;
  iso?: string | null;
  year?: number | null;
};

export type Photo = {
  /** Astro image metadata — feeds <Image /> so derivatives get generated. */
  src: ImageMetadata;
  /** Category path the photo sits in, e.g. ['people','portraits']. */
  path: string[];
  /** Alt text derived from the filename. */
  alt: string;
  /** Stable id used to link a grid tile to its lightbox slide. */
  id: string;
  /** width / height — lets the grid reserve space before the image loads. */
  ratio: number;
  /** Camera settings, when the original carried them. */
  details?: ShootingDetails;
};

/**
 * Every image under src/photos is picked up automatically. Dropping a new
 * file into src/photos/<category>/ is all it takes to publish it — there is
 * no manifest to keep in sync.
 */
const files = import.meta.glob<{ default: ImageMetadata }>(
  '/src/photos/**/*.{jpg,jpeg,JPG,JPEG,png,PNG,webp,avif}',
  { eager: true },
);

/** "golden-hour-ridge.jpg" -> "Golden hour ridge" */
function altFromFilename(file: string): string {
  const base = file.split('/').pop()!.replace(/\.[^.]+$/, '');
  const words = base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!words) return 'Photograph';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The sidecars written by the import tool, keyed by gallery path.
 * `/src/photos/people/events/_meta.json` -> 'people/events'
 */
const metaFiles = import.meta.glob<{ default: Record<string, ShootingDetails> }>(
  '/src/photos/**/_meta.json',
  { eager: true },
);

const META = new Map<string, Record<string, ShootingDetails>>(
  Object.entries(metaFiles).map(([file, mod]) => [
    file.replace('/src/photos/', '').replace('/_meta.json', ''),
    mod.default ?? {},
  ]),
);

const ALL: Photo[] = Object.entries(files)
  .map(([file, mod]) => {
    const rel = file.replace('/src/photos/', '');
    const parts = rel.split('/');
    const path = parts.slice(0, -1);
    const filename = parts[parts.length - 1];
    const src = mod.default;
    const details = META.get(path.join('/'))?.[filename];
    return {
      src,
      path,
      alt: altFromFilename(file),
      id: rel.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase(),
      ratio: src.width / src.height,
      details,
    };
  })
  // Stable, predictable order: alphabetical by file path.
  .sort((a, b) => a.id.localeCompare(b.id));

/**
 * The hero photograph, which belongs to no gallery.
 *
 * It lives in src/hero/ rather than src/photos/ precisely so the galleries
 * cannot see it: it does not appear in any gallery, is not counted in any
 * category's total, and is never a category's cover. There is only ever one
 * file there — the import tool replaces it rather than adding to it.
 */
const heroFiles = import.meta.glob<{ default: ImageMetadata }>(
  '/src/hero/*.{jpg,jpeg,JPG,JPEG,png,PNG,webp,avif}',
  { eager: true },
);

/**
 * The phone's hero, if one has been set.
 *
 * A single glob star does not descend into folders, so the desktop glob above
 * cannot see this one — the two never collide.
 *
 * Worth having separately because a wide photograph on a tall phone screen has
 * to be cropped to a narrow slice of itself, which usually throws away the
 * subject. A portrait frame chosen for the phone keeps it.
 */
const heroMobileFiles = import.meta.glob<{ default: ImageMetadata }>(
  '/src/hero/mobile/*.{jpg,jpeg,JPG,JPEG,png,PNG,webp,avif}',
  { eager: true },
);

function firstOf(
  files: Record<string, { default: ImageMetadata }>,
  id: string,
): Photo | undefined {
  const entries = Object.entries(files).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) return undefined;

  const [file, mod] = entries[0];
  const src = mod.default;
  return {
    src,
    path: [],
    alt: altFromFilename(file),
    id,
    ratio: src.width / src.height,
  };
}

export function heroPhoto(): Photo | undefined {
  return firstOf(heroFiles, 'hero');
}

export function heroMobilePhoto(): Photo | undefined {
  return firstOf(heroMobileFiles, 'hero-mobile');
}

/** Photos in a gallery, or — for a parent like "people" — all of its children. */
export function photosIn(path: string[]): Photo[] {
  return ALL.filter((p) => path.every((seg, i) => p.path[i] === seg));
}

/** One representative photo for a category, used as its cover tile. */
export function coverFor(path: string[]): Photo | undefined {
  return photosIn(path)[0];
}

export function allPhotos(): Photo[] {
  return ALL;
}
