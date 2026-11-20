/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  experimental: {
    outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
    // The managed Spark profile may take 120 s to produce one validated draft page.
    proxyTimeout: 135_000,
  },
  transpilePackages: ['@cyris/contracts'],
  async rewrites() {
    const apiTarget = (process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000').replace(/\/+$/, '');
    return [
      {
        source: '/api/:path*',
        destination: `${apiTarget}/:path*`,
      },
    ];
  },
};

export default nextConfig;
