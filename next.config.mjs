/** @type {import('next').NextConfig} */

// Content Security Policy — REPORT-ONLY for now: Stripe Checkout, Supabase,
// the Google Maps embed and existing inline styles/scripts must be observed
// in the browser console / reports before enforcement is switched on
// (rename the header to Content-Security-Policy once verified clean).
const cspReportOnly = [
  "default-src 'self'",
  // Next.js inline runtime + framer-motion require inline; Stripe.js is the
  // only third-party script surface.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://alduwuipmmnzorcgkcli.supabase.co https://mbrcricket.com https://leopoldsporties.com https://www.blackmansbrewery.com.au https://phoenixtruckbodies.com.au https://www.swlocksmiths.com.au",
  "font-src 'self' data:",
  "connect-src 'self' https://alduwuipmmnzorcgkcli.supabase.co https://api.stripe.com",
  "frame-src https://js.stripe.com https://checkout.stripe.com https://www.google.com",
  "form-action 'self' https://checkout.stripe.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com" "https://checkout.stripe.com")' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'Content-Security-Policy-Report-Only', value: cspReportOnly },
];

const nextConfig = {
  poweredByHeader: false,
  images: {
    // Next.js 15.5.24 is the patched release for GHSA-2xp9-vwfh-vxw4.
    // Its AVIF input protection must remain in place; output only WebP.
    // See https://nextjs.org/blog/august-2026-security-release
    unoptimized: false,
    formats: ['image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'alduwuipmmnzorcgkcli.supabase.co' },
      { protocol: 'https', hostname: 'mbrcricket.com' },
      { protocol: 'https', hostname: 'leopoldsporties.com' },
      { protocol: 'https', hostname: 'www.blackmansbrewery.com.au' },
      { protocol: 'https', hostname: 'phoenixtruckbodies.com.au' },
      { protocol: 'https', hostname: 'www.swlocksmiths.com.au' },
    ],
  },
  async redirects() {
    // Renamed, optimised (WebP) and de-duplicated public assets. The map is
    // maintained by scripts/optimise-public-images.mjs and validated by
    // scripts/check-public-assets.mjs; redirects run before public files.
    const { readFileSync } = await import('node:fs');
    const assetRedirects = JSON.parse(readFileSync(new URL('./lib/asset-redirects.json', import.meta.url), 'utf8'));
    return Object.entries(assetRedirects).map(([source, destination]) => ({ source, destination, permanent: true }));
  },
  async headers() {
    return [
      ...['/admin/:path*', '/committee/:path*', '/committee-calendar', '/payment', '/fantasy/login', '/fantasy/register', '/fantasy/reset-password', '/fantasy/account', '/fantasy/team', '/fantasy/squad', '/fantasy/transfers', '/fantasy/leagues'].map((source) => ({
        source, headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      })),
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
