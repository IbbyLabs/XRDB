import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  // Output directly into the Go embed target so `go build` picks it up.
  distDir: '../internal/ui/dist',
  // Static export: no server-side image optimisation available.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
