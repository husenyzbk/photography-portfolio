import type { Photo } from './photos';

export type Row = { photos: Photo[]; sumRatio: number };

/**
 * Groups photos into justified rows.
 *
 * Because the site is built statically, every photo's aspect ratio is known
 * ahead of time — so rows can be balanced here, at build time, and rendered as
 * plain flex percentages. The alternative (measuring in the browser) causes
 * layout shift on load and costs JavaScript on every resize.
 *
 * Within a row each photo gets flex-grow proportional to its aspect ratio,
 * which makes every photo in the row exactly the same height and the row
 * exactly full width — the classic justified gallery, no script involved.
 *
 * @param targetRatio roughly how many landscape-ish photos per row.
 */
export function justify(photos: Photo[], targetRatio = 3.2): Row[] {
  const rows: Row[] = [];
  let current: Photo[] = [];
  let sum = 0;

  for (const photo of photos) {
    current.push(photo);
    sum += photo.ratio;

    if (sum >= targetRatio) {
      rows.push({ photos: current, sumRatio: sum });
      current = [];
      sum = 0;
    }
  }

  // Trailing photos: rather than stretching two portraits across the full
  // width (which would blow them up out of proportion to everything above),
  // pad the row's ratio so the leftovers keep a sane height.
  if (current.length) {
    rows.push({ photos: current, sumRatio: Math.max(sum, targetRatio * 0.72) });
  }

  return rows;
}
