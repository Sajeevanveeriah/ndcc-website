import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://www.ndcc.com.au';

  return {
    rules: [
      {
        userAgent: '*',
        // Only inspected public GET resources used by public-page browser refreshes.
        allow: ['/', '/admin/login$', '/api/apparel/products$', '/api/apparel/windows$', '/api/public/content-blocks$', '/api/public/content-blocks?',
          '/api/kitchen/menu$', '/api/kitchen/window$', '/api/public/sponsors$',
          '/api/public/club-season$', '/api/volunteer-positions$', '/api/content-blocks?'],
        disallow: ['/admin/', '/api/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
