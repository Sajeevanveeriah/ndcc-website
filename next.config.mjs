/** @type {import('next').NextConfig} */

// Content Security Policy — ENFORCED.
// - script-src keeps 'unsafe-inline' for the Next.js inline bootstrap/RSC
//   payload scripts; 'unsafe-eval' is not needed by the production build.
//   Stripe.js and Cloudflare Turnstile (optional bot check) are the only
//   third-party script hosts.
// - img-src allows any https host so CMS/sponsor images keep working when an
//   editor pastes an external image URL; next/image output is same-origin.
// - connect-src: Supabase REST/auth/storage and realtime (wss, used by the
//   Dino Coach wallet panel) plus Stripe. Vercel Web Analytics v2 posts to
//   same-origin /_vercel/insights, covered by 'self'.
// - frame-src: Stripe, the Google Maps embed (www.google.com/maps/embed) and
//   Turnstile challenges.
// `next dev` (React Refresh / eval source maps) still needs 'unsafe-eval'.
const devScriptEval = process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${devScriptEval} https://js.stripe.com https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' blob: https://alduwuipmmnzorcgkcli.supabase.co",
  "connect-src 'self' https://alduwuipmmnzorcgkcli.supabase.co wss://alduwuipmmnzorcgkcli.supabase.co https://*.supabase.co wss://*.supabase.co https://api.stripe.com",
  "frame-src https://js.stripe.com https://checkout.stripe.com https://www.google.com https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
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
  { key: 'Content-Security-Policy', value: csp },
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
