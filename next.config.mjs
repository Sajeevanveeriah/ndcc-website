/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'mbrcricket.com' },
      { protocol: 'https', hostname: 'leopoldsporties.com' },
      { protocol: 'https', hostname: 'www.blackmansbrewery.com.au' },
      { protocol: 'https', hostname: 'phoenixtruckbodies.com.au' },
      { protocol: 'https', hostname: 'www.swlocksmiths.com.au' },
    ],
  },
};

export default nextConfig;
