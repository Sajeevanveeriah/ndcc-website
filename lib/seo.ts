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

export function pageMetadata(path: string, title: string, description: string, image = '/images/logo.jpg'): Metadata {
  const images = [{ url: absoluteUrl(image), alt: title }];
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
