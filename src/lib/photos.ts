import type { ImageMetadata } from 'astro';

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

const ALL: Photo[] = Object.entries(files)
  .map(([file, mod]) => {
    const rel = file.replace('/src/photos/', '');
    const parts = rel.split('/');
    const path = parts.slice(0, -1);
    const src = mod.default;
    return {
      src,
      path,
      alt: altFromFilename(file),
      id: rel.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase(),
      ratio: src.width / src.height,
    };
  })
  // Stable, predictable order: alphabetical by file path.
  .sort((a, b) => a.id.localeCompare(b.id));

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
