import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  // Output directly into the Go embed target so `go build` picks it up.
  // In dev mode stay inside web/ — module resolution breaks outside it.
  distDir: process.env.NODE_ENV === 'production' ? '../internal/ui/dist' : '.next',
  // Static export: no server-side image optimisation available.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
