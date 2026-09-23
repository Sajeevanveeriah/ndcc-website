import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = SITE_URL;

  return {
    rules: [
      {
        userAgent: '*',
        // Only inspected public GET resources used by public-page browser refreshes.
        // /admin (including /admin/login) stays disallowed and is noindexed.
        allow: ['/', '/api/apparel/products$', '/api/apparel/windows$', '/api/public/content-blocks$', '/api/public/content-blocks?',
          '/api/kitchen/menu$', '/api/kitchen/window$', '/api/public/sponsors$',
          '/api/public/club-season$', '/api/volunteer-positions$', '/api/content-blocks?'],
        disallow: ['/admin/', '/api/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
