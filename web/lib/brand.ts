export const BRAND_NAME = 'XRDB';
export const BRAND_FULL_NAME = 'eXtended Ratings DataBase';
export const BRAND_DISPLAY_NAME = `${BRAND_NAME} | ${BRAND_FULL_NAME}`;
export const BRAND_GITHUB_URL = 'https://github.com/IbbyLabs/XRDB';
export const BRAND_SUPPORT_URL = 'https://kofi.ibbylabs.dev';
export const BRAND_UPTIME_URL = 'https://uptime.ibbylabs.dev';
export const BRAND_DISCORD_URL = 'https://discord.ibbylabs.dev';
/** A direct message to the developer, as opposed to the community server.
 *  Both are ibbylabs.dev redirects so the contact links read as one set and
 *  the destination can move without editing every place it is written. */
export const BRAND_DISCORD_DM_URL = 'https://dm.ibbylabs.dev';
export const BRAND_DEVELOPER = 'IbbyLabs';
export const BRAND_DEVELOPER_URL = 'https://ibbylabs.dev';

/** The public instance ElfHosted runs at the author's invitation. Its profile
 *  store is its own: a profile saved here does not exist there. */
export const PUBLIC_INSTANCE_NAME = 'ElfHosted';
export const PUBLIC_INSTANCE_URL = 'https://xrdb.elfhosted.com';

/** The hosts this deployment answers on. The public-instance card is for our
 *  own visitors only; a self-hosted XRDB serving the same pages must not
 *  advertise another host. */
export const CANONICAL_HOST = 'extendedratings.com';
export function isCanonicalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === CANONICAL_HOST || h.endsWith('.' + CANONICAL_HOST);
}
