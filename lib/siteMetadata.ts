import type { Metadata, Viewport } from 'next';
import { BRAND_DISPLAY_NAME, BRAND_FULL_NAME, BRAND_NAME } from './siteBrand.ts';

const DEFAULT_APP_URL = 'http://localhost:3000';
const SITE_DESCRIPTION =
  'XRDB, eXtended Ratings DataBase, is the active repository for releases, docs, and deployment updates.';
const SITE_SOCIAL_DESCRIPTION =
  'XRDB, eXtended Ratings DataBase, is the active repository for releases, docs, and deployment updates.';

const resolveMetadataBase = (appUrl?: string) => new URL(appUrl || DEFAULT_APP_URL);

export const siteViewport: Viewport = {
  themeColor: '#020108',
};

export const buildSiteMetadata = (appUrl?: string): Metadata => ({
  metadataBase: resolveMetadataBase(appUrl),
  title: `${BRAND_DISPLAY_NAME} | Stateless Artwork Engine`,
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
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
    shortcut: ['/favicon.ico'],
  },
  openGraph: {
    type: 'website',
    title: BRAND_DISPLAY_NAME,
    description: SITE_SOCIAL_DESCRIPTION,
    images: ['/favicon.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${BRAND_NAME} | ${BRAND_FULL_NAME}`,
    description: SITE_SOCIAL_DESCRIPTION,
    images: ['/favicon.png'],
  },
});
