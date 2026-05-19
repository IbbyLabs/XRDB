import type { Metadata, Viewport } from 'next';
import { BRAND_DISPLAY_NAME, BRAND_NAME } from './siteBrand.ts';
import { parseForwardedHost, parseForwardedProto } from './proxyRouteRequest.ts';

const DEFAULT_APP_URL = 'http://localhost:3000';
const SITE_TITLE = `${BRAND_NAME} | Artwork Engine for Stremio`;
const SITE_DESCRIPTION =
  'Self hosted artwork engine that adds ratings, quality badges, and visual overlays to Stremio posters and backdrops.';
const SITE_SOCIAL_DESCRIPTION =
  'Add IMDb ratings and quality badges to your Stremio posters. Self hosted, open source, and works with AIOMetadata.';

type RuntimeMetadataBaseContext = {
  requestUrl: string;
  hostHeader: string | null;
  forwardedHostHeader: string | null;
  forwardedProtoHeader: string | null;
  trustForwarded: boolean;
  appUrl?: string;
};

const resolveMetadataBase = (appUrl?: string) => {
  try {
    return new URL(appUrl || DEFAULT_APP_URL);
  } catch {
    return new URL(DEFAULT_APP_URL);
  }
};

const resolveRequestProto = (requestUrl: string) => {
  try {
    const proto = new URL(requestUrl).protocol.replace(':', '').toLowerCase();
    return proto === 'https' ? 'https' : 'http';
  } catch {
    return 'http';
  }
};

const resolveRuntimeMetadataBase = ({
  requestUrl,
  hostHeader,
  forwardedHostHeader,
  forwardedProtoHeader,
  trustForwarded,
  appUrl,
}: RuntimeMetadataBaseContext) => {
  if (trustForwarded) {
    const forwardedHost = parseForwardedHost(forwardedHostHeader);
    if (forwardedHost) {
      const forwardedProto = parseForwardedProto(forwardedProtoHeader) || 'https';
      return new URL(`${forwardedProto}://${forwardedHost}`);
    }
  }

  const requestHost = parseForwardedHost(hostHeader);
  if (requestHost) {
    return new URL(`${resolveRequestProto(requestUrl)}://${requestHost}`);
  }

  return resolveMetadataBase(appUrl);
};

export const siteViewport: Viewport = {
  themeColor: '#020108',
  colorScheme: 'dark',
};

export const buildSiteMetadata = (appUrl?: string): Metadata => ({
  metadataBase: resolveMetadataBase(appUrl),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: BRAND_DISPLAY_NAME,
  manifest: '/site.webmanifest',
  appleWebApp: {
    title: BRAND_DISPLAY_NAME,
    capable: true,
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico' },
      { url: '/favicon-512x512.png', sizes: '512x512', type: 'image/png' },
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
    shortcut: ['/favicon.ico'],
  },
  openGraph: {
    type: 'website',
    siteName: BRAND_DISPLAY_NAME,
    locale: 'en_US',
    title: SITE_TITLE,
    description: SITE_SOCIAL_DESCRIPTION,
    images: [{ url: '/discord-banner.png', width: 1376, height: 768, alt: 'XRDB | Artwork Engine for Stremio' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_SOCIAL_DESCRIPTION,
    images: [{ url: '/discord-banner.png', width: 1376, height: 768, alt: 'XRDB | Artwork Engine for Stremio' }],
  },
});

export const buildRuntimeSiteMetadata = (context: RuntimeMetadataBaseContext): Metadata => {
  const metadataBase = resolveRuntimeMetadataBase(context).toString();
  return buildSiteMetadata(metadataBase);
};
