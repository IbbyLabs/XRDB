import packageJson from '../package.json' with { type: 'json' };

export const BRAND_NAME = 'XRDB';
export const BRAND_FULL_NAME = 'eXtended Ratings DataBase';
export const BRAND_DISPLAY_NAME = `${BRAND_NAME} | ${BRAND_FULL_NAME}`;

export const BRAND_GITHUB_URL = 'https://github.com/IbbyLabs/XRDB';
export const BRAND_GITHUB_LABEL = 'XRDB Repo';
export const BRAND_SUPPORT_URL = 'https://kofi.ibbylabs.dev';
export const BRAND_UPTIME_URL = 'https://uptime.ibbylabs.dev';
export const BRAND_DISCORD_AIO_URL = 'https://discord.gg/DdXgUY7e8z';
export const BRAND_DISCORD_AIO_LABEL = 'AIOMetadata in AIOStreams';
export const BRAND_DISCORD_OFFICIAL_URL = 'https://discord.gg/wPY2pcqjmm';
export const BRAND_DISCORD_OFFICIAL_LABEL = 'Join the XRDB Community';
export const BRAND_DISCORD_DM_URL = 'https://discord.com/users/947862578682548255';
export const BRAND_DISCORD_DM_HANDLE = '@ibbys89';
export const BRAND_DEVELOPER = 'Developed by IbbyLabs';
export const BRAND_DEVELOPER_URL = 'https://ibbylabs.dev';
export const PACKAGE_VERSION = `v${String(packageJson.version || '').trim() || 'dev'}`;
export const DEPLOYMENT_VERSION =
  String(process.env.NEXT_PUBLIC_DEPLOYMENT_VERSION || PACKAGE_VERSION).trim() || 'dev';

function formatUkBuildTime(dateStamp: string, timeStamp: string): string {
  const year = Number(dateStamp.slice(0, 4));
  const month = Number(dateStamp.slice(4, 6));
  const day = Number(dateStamp.slice(6, 8));
  const hour = Number(timeStamp.slice(0, 2));
  const minute = Number(timeStamp.slice(2, 4));
  if ([year, month, day, hour, minute].some(Number.isNaN)) {
    return `${dateStamp} ${timeStamp}`;
  }

  const buildDate = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const datePart = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    timeZone: 'Europe/London',
  }).format(buildDate);
  const timePart = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/London',
  }).format(buildDate);

  return `${datePart} ${timePart}`;
}

function resolveNavBuildMeta(version: string): {
  label: string;
  commitHash: string | null;
  commitUrl: string | null;
} {
  const pureDevVersionMatch = version.match(/^dev\.(\d{8})\.(\d{4})\.([0-9a-f]{7,40})$/i);
  if (pureDevVersionMatch) {
    const [, dateStamp, timeStamp, fullHash] = pureDevVersionMatch;
    const shortHash = fullHash.slice(0, 7);
    return {
      label: `dev ${formatUkBuildTime(dateStamp, timeStamp)}`,
      commitHash: shortHash,
      commitUrl: `${BRAND_GITHUB_URL}/commit/${fullHash}`,
    };
  }

  const devVersionMatch = version.match(/^v[^-]+-dev\.(\d{8})\.(\d{4})\.([0-9a-f]{7,40})$/i);
  if (devVersionMatch) {
    const [, dateStamp, timeStamp, fullHash] = devVersionMatch;
    const shortHash = fullHash.slice(0, 7);
    return {
      label: `dev ${formatUkBuildTime(dateStamp, timeStamp)}`,
      commitHash: shortHash,
      commitUrl: `${BRAND_GITHUB_URL}/commit/${fullHash}`,
    };
  }

  if (version.includes('-dev')) {
    const hashMatch = version.match(/([0-9a-f]{7,40})$/i);
    const fullHash = hashMatch?.[1] ?? null;
    return {
      label: 'dev',
      commitHash: fullHash ? fullHash.slice(0, 7) : null,
      commitUrl: fullHash ? `${BRAND_GITHUB_URL}/commit/${fullHash}` : null,
    };
  }

  return {
    label: version,
    commitHash: null,
    commitUrl: null,
  };
}

const navBuildMeta = resolveNavBuildMeta(DEPLOYMENT_VERSION);
export const NAV_VERSION_LABEL = navBuildMeta.label;
export const NAV_VERSION_COMMIT_HASH = navBuildMeta.commitHash;
export const NAV_VERSION_COMMIT_URL = navBuildMeta.commitUrl;
