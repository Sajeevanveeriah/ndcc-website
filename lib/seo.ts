import type { Metadata } from 'next';

export const SITE_URL = 'https://www.ndcc.com.au';
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const ORGANIZATION_NAME = 'Newcomb and District Cricket Club';

/**
 * Same suffix as the root layout's title template. A layout whose title is a
 * plain string resets the template for its child routes (Next.js only passes
 * a template down from the nearest layout that sets one), so section layouts
 * re-declare it to keep detail pages such as /events/[id] and /news/[id] on
 * "<title> | NDCC Dinos".
 */
export const SITE_TITLE_TEMPLATE = '%s | NDCC Dinos';

export function absoluteUrl(path: string): string {
  return new URL(path, `${SITE_URL}/`).href;
}

/**
 * Default social preview: the club logo letterboxed to 1200x630 on white
 * (generated from public/images/logo.jpg; about 66 KB instead of 367 KB).
 */
export const DEFAULT_OG_IMAGE = { url: '/images/og-default.jpg', width: 1200, height: 630 } as const;

// CMS uploads (Supabase Storage originals, often several MB). The host is in
// next.config.mjs images.remotePatterns, so the Next image optimiser can serve
// a resized copy.
const OPTIMISABLE_IMAGE_HOSTS = new Set(['alduwuipmmnzorcgkcli.supabase.co']);
export const SOCIAL_IMAGE_WIDTH = 1200;

/**
 * Absolute URL for an og:image / twitter:image. Supabase Storage originals go
 * through the Next image optimiser at 1200px wide (a default device size), so
 * link previews fetch a few hundred KB instead of the multi-MB upload.
 */
export function socialImageUrl(src: string): string {
  const absolute = absoluteUrl(src);
  let host: string;
  try {
    host = new URL(absolute).hostname;
  } catch {
    return absolute;
  }
  if (!OPTIMISABLE_IMAGE_HOSTS.has(host)) return absolute;
  return `${SITE_URL}/_next/image?url=${encodeURIComponent(absolute)}&w=${SOCIAL_IMAGE_WIDTH}&q=75`;
}

export function pageMetadata(path: string, title: string, description: string, image?: string): Metadata {
  const images = image
    ? [{ url: socialImageUrl(image), alt: title }]
    : [{ url: absoluteUrl(DEFAULT_OG_IMAGE.url), width: DEFAULT_OG_IMAGE.width, height: DEFAULT_OG_IMAGE.height, alt: title }];
  return {
    // Renders as "<title> | NDCC Dinos" (root template). The template is
    // re-declared so routes nested under a layout using this helper keep it.
    title: { default: title, template: SITE_TITLE_TEMPLATE },
    description,
    alternates: { canonical: absoluteUrl(path) },
    openGraph: {
      type: 'website', locale: 'en_AU', siteName: ORGANIZATION_NAME,
      title: `${title} | NDCC Dinos`, description, url: absoluteUrl(path), images,
    },
    twitter: { card: 'summary_large_image', title: `${title} | NDCC Dinos`, description, images },
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem', position: index + 1, name: item.name, item: absoluteUrl(item.path),
    })),
  };
}

export function authorJsonLd(author: string | null | undefined) {
  const name = author?.trim();
  if (!name || /^(NDCC|Newcomb (and|&) District Cricket Club)$/i.test(name)) {
    return { '@type': 'Organization', '@id': ORGANIZATION_ID, name: ORGANIZATION_NAME };
  }
  return { '@type': 'Person', name };
}
