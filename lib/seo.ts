import type { Metadata } from 'next';

export const SITE_URL = 'https://www.ndcc.com.au';
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const ORGANIZATION_NAME = 'Newcomb and District Cricket Club';

export function absoluteUrl(path: string): string {
  return new URL(path, `${SITE_URL}/`).href;
}

export function pageMetadata(path: string, title: string, description: string, image = '/images/logo.jpg'): Metadata {
  const images = [{ url: absoluteUrl(image), alt: title }];
  return {
    title,
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
