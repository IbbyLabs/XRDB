import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'image.tmdb.org' },
    ],
  },
  async rewrites() {
    const apiBase = process.env.XRDB_API_BASE_URL ?? 'http://localhost:8787';
    return [
      { source: '/poster/:path*',      destination: `${apiBase}/poster/:path*` },
      { source: '/backdrop/:path*',    destination: `${apiBase}/backdrop/:path*` },
      { source: '/thumbnail/:path*',   destination: `${apiBase}/thumbnail/:path*` },
      { source: '/logo/:path*',        destination: `${apiBase}/logo/:path*` },
      { source: '/profile',            destination: `${apiBase}/profile` },
      { source: '/profile/:path*',     destination: `${apiBase}/profile/:path*` },
      { source: '/healthz',            destination: `${apiBase}/healthz` },
      { source: '/readyz',             destination: `${apiBase}/readyz` },
      { source: '/render-placeholder', destination: `${apiBase}/render-placeholder` },
      { source: '/api/admin/:path*',   destination: `${apiBase}/api/admin/:path*` },
    ];
  },
};

export default nextConfig;
