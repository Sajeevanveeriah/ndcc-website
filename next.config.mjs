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
    // Temporary containment for the Next.js AVIF image-optimiser advisory on
    // the pinned 14.x release. Remove only after an approved patched upgrade.
    unoptimized: true,
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
    return [
      { source: '/images/2026/06/rhys_bath-1781078437785.png', destination: '/images/2026/06/Rhys_Bath.png', permanent: true },
      { source: '/images/2026/08/20260731-season-launch-rev00-1786263617170.png', destination: '/images/2026/08/20260731-season-launch-rev00-1785925011182.png', permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
