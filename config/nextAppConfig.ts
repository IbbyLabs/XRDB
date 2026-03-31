import type { NextConfig } from 'next';

import packageJson from '../package.json';

const defaultHeaders = [
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    value: 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
  },
  {
    key: 'Content-Security-Policy',
    value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https: ws: wss:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
  },
];

function readBuildValue(value: unknown, fallback: string) {
  const resolved = String(value ?? '').trim();
  return resolved || fallback;
}

function resolveBuildName() {
  return readBuildValue(
    process.env.XRDB_BUILD_NAME ?? process.env.npm_package_name ?? packageJson.name,
    'xrdb',
  );
}

function resolveBuildVersion() {
  return readBuildValue(
    process.env.XRDB_BUILD_VERSION ?? process.env.npm_package_version ?? packageJson.version,
    '1.0',
  );
}

function buildHeaders() {
  return [
    {
      source: '/:path*',
      headers: defaultHeaders,
    },
  ];
}

export function createNextAppConfig(): NextConfig {
  const disableHmr = process.env.DISABLE_HMR === 'true';

  return {
    reactStrictMode: true,
    env: {
      XRDB_BUILD_NAME: resolveBuildName(),
      XRDB_BUILD_VERSION: resolveBuildVersion(),
    },
    eslint: {
      ignoreDuringBuilds: true,
    },
    typescript: {
      ignoreBuildErrors: false,
    },
    images: {
      remotePatterns: [
        {
          protocol: 'https',
          hostname: 'picsum.photos',
          port: '',
          pathname: '/**',
        },
      ],
    },
    output: 'standalone',
    outputFileTracingRoot: process.cwd(),
    transpilePackages: ['motion'],
    async headers() {
      return buildHeaders();
    },
    webpack: (config, { dev }) => {
      if (dev && disableHmr) {
        config.watchOptions = {
          ignored: /.*/,
        };
      }
      return config;
    },
  };
}

const nextAppConfig = createNextAppConfig();

export default nextAppConfig;
