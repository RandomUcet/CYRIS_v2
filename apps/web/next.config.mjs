import {readFileSync} from 'node:fs';

// Expose the version that was actually bundled into this web build, not a hard-coded label.
const packageVersion=JSON.parse(readFileSync(new URL('./package.json',import.meta.url),'utf8')).version;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_CYRIS_VERSION: packageVersion },
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
