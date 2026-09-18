/**
 * Site-wide configuration.
 *
 * SITE is the only place the public URL is written down — switching from the
 * free github.io address to a bought domain later is a one-line edit here.
 */
export const SITE = {
  /** Public origin, no trailing slash. */
  url: 'https://husenyzbk.github.io',
  /** Sub-path the site is served under. '/' once it lives on its own domain. */
  base: '/photography-portfolio',
  title: 'Hussein Yazbeck',
  tagline: 'Photography',
  description:
    'Photography by Hussein Yazbeck — animals, people and the outdoors.',
  instagram: 'https://instagram.com/husenyzbk2',

  /**
   * The contact address, base64-encoded.
   *
   * Address-harvesting bots scrape pages for anything shaped like an email
   * address. Splitting the address into two plain strings is not enough —
   * they both end up in the served HTML, where "husenyzbkp" and "hotmail.com"
   * sit a few characters apart and are trivially recombined. Encoded, no part
   * of the address appears in the page at all; it is decoded in the browser
   * only when someone actually submits the form.
   *
   * This raises the cost of harvesting. It does not make the address secret —
   * anyone who submits the form sees it, as they must.
   *
   * To change it:  node -e "console.log(Buffer.from('you@example.com').toString('base64'))"
   */
  contactEncoded: 'aHVzZW55emJrcEBob3RtYWlsLmNvbQ==',
} as const;

export type Category = {
  /** URL segment. */
  slug: string;
  /** Display name. */
  name: string;
  /** Shown under the title on the category page. */
  blurb: string;
  /** Nested galleries. A category either has children or holds photos itself. */
  children?: Category[];
};

/**
 * The category tree. Photos are read from src/photos/<slug>/... so adding a
 * gallery means adding an entry here and dropping a folder of photos in —
 * nothing else needs editing.
 */
export const CATEGORIES: Category[] = [
  {
    slug: 'animals',
    name: 'Animals',
    blurb: 'Creatures met along the way.',
  },
  {
    slug: 'people',
    name: 'People',
    blurb: 'Faces, gatherings, and the moments between.',
    children: [
      {
        slug: 'events',
        name: 'Events',
        blurb: 'Gatherings, celebrations, and the energy of a room.',
      },
      {
        slug: 'portraits',
        name: 'Portraits',
        blurb: 'Someone, looking back.',
      },
    ],
  },
  {
    slug: 'outdoors',
    name: 'Outdoors',
    blurb: 'Away from the walls.',
    children: [
      {
        slug: 'street-photography',
        name: 'Street Photography',
        blurb: 'The city, unrehearsed.',
      },
      {
        slug: 'miscellaneous',
        name: 'Miscellaneous',
        blurb: 'Everything else worth stopping for.',
      },
    ],
  },
];

/** Flattened list of every gallery that actually holds photos. */
export function leafCategories(): { path: string[]; category: Category }[] {
  const out: { path: string[]; category: Category }[] = [];
  for (const c of CATEGORIES) {
    if (c.children?.length) {
      for (const child of c.children) {
        out.push({ path: [c.slug, child.slug], category: child });
      }
    } else {
      out.push({ path: [c.slug], category: c });
    }
  }
  return out;
}
