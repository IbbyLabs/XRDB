import packageJson from '../package.json' with { type: 'json' };

export const BRAND_NAME = 'XRDB';
export const BRAND_FULL_NAME = 'eXtended Ratings DataBase';
export const BRAND_DISPLAY_NAME = `${BRAND_NAME} | ${BRAND_FULL_NAME}`;

export const BRAND_GITHUB_URL =
  process.env.NEXT_PUBLIC_BRAND_GITHUB_URL || 'https://github.com/IbbyLabs/XRDB';
export const BRAND_GITHUB_LABEL =
  process.env.NEXT_PUBLIC_BRAND_GITHUB_LABEL || 'XRDB Repo';
export const BRAND_ARCHIVE_TITLE =
  process.env.NEXT_PUBLIC_BRAND_ARCHIVE_TITLE || 'This is the active XRDB repository';
export const BRAND_ARCHIVE_COPY =
  process.env.NEXT_PUBLIC_BRAND_ARCHIVE_COPY ||
  'Use this repository for current releases, fixes, docs, installs, and issue tracking.';
export const BRAND_SUPPORT_URL =
  process.env.NEXT_PUBLIC_BRAND_SUPPORT_URL || 'https://kofi.ibbylabs.dev';
export const BRAND_UPTIME_URL =
  process.env.NEXT_PUBLIC_BRAND_UPTIME_URL || 'https://uptime.ibbylabs.dev';
export const BRAND_DISCORD_AIO_URL =
  process.env.NEXT_PUBLIC_BRAND_DISCORD_AIO_URL || 'https://discord.gg/5S2nTdV2uD';
export const BRAND_DISCORD_AIO_LABEL =
  process.env.NEXT_PUBLIC_BRAND_DISCORD_AIO_LABEL || 'XRDB in AIOStreams Discord';
export const BRAND_DISCORD_OFFICIAL_URL =
  process.env.NEXT_PUBLIC_BRAND_DISCORD_OFFICIAL_URL || 'https://discord.gg/wPY2pcqjmm';
export const BRAND_DISCORD_OFFICIAL_LABEL =
  process.env.NEXT_PUBLIC_BRAND_DISCORD_OFFICIAL_LABEL || 'Official XRDB Discord';
export const BRAND_DISCORD_DM_URL =
  process.env.NEXT_PUBLIC_BRAND_DISCORD_DM_URL || 'https://discord.com/users/947862578682548255';
export const BRAND_DISCORD_DM_HANDLE =
  process.env.NEXT_PUBLIC_BRAND_DISCORD_DM_HANDLE || '@ibbys89';
export const PACKAGE_VERSION = `v${String(packageJson.version || '').trim() || 'dev'}`;
export const DEPLOYMENT_VERSION =
  String(process.env.NEXT_PUBLIC_DEPLOYMENT_VERSION || PACKAGE_VERSION).trim() || 'dev';
