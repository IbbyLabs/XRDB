/**
 * Fusion-format icon packs: a JSON list of { name, url }, where the name carries
 * a source code in brackets, e.g. "IMDb (IM)", or leads with it, e.g. "TM (TMDB)".
 */

const PACK_CODES: Record<string, string> = {
  IM: 'imdb',
  TM: 'tmdb',
  RT: 'rt',
  PC: 'rtaudience',
  MC: 'metacritic',
  MU: 'metacriticuser',
  LB: 'letterboxd',
  TR: 'trakt',
  SI: 'simkl',
  AN: 'anilist',
  ML: 'mal',
  KI: 'kitsu',
  RE: 'rogerebert',
  MD: 'mdblist',
  AC: 'allocine',
  AP: 'allocinepress',
  FW: 'filmweb',
  PM: 'pmdb',
};

const MAX_URL_LEN = 1024;

function sourceForName(name: string): string | undefined {
  const bracket = name.match(/\(([A-Za-z]{2,4})\)\s*$/)?.[1]?.toUpperCase();
  if (bracket && PACK_CODES[bracket]) return PACK_CODES[bracket];
  const lead = name.match(/^([A-Za-z]{2})\b/)?.[1]?.toUpperCase();
  return lead ? PACK_CODES[lead] : undefined;
}

export function isIconUrl(value: string): boolean {
  if (value.length > MAX_URL_LEN) return false;
  try {
    const u = new URL(value);
    return (u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password;
  } catch {
    return false;
  }
}

export interface PackImport {
  icons: Record<string, string>;
  skipped: number;
}

/** Maps a pack's entries to source ids. The first entry for a source wins. */
export function parseIconPack(data: unknown): PackImport {
  if (!Array.isArray(data)) throw new Error('The pack is not a JSON list of icons.');
  const icons: Record<string, string> = {};
  let skipped = 0;
  for (const entry of data as { name?: unknown; url?: unknown }[]) {
    const name = typeof entry?.name === 'string' ? entry.name : '';
    const url = typeof entry?.url === 'string' ? entry.url.trim() : '';
    const source = sourceForName(name);
    if (!source || !isIconUrl(url)) {
      skipped++;
      continue;
    }
    if (!icons[source]) icons[source] = url;
  }
  return { icons, skipped };
}

export async function fetchIconPack(packUrl: string, signal?: AbortSignal): Promise<PackImport> {
  if (!isIconUrl(packUrl)) throw new Error('Enter an http(s) link to a pack.');
  let res: Response;
  try {
    res = await fetch(packUrl, { signal, credentials: 'omit' });
  } catch {
    throw new Error('The pack could not be fetched. Its host may not allow browser requests.');
  }
  if (!res.ok) throw new Error(`The pack returned HTTP ${res.status}.`);
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error('The pack is not valid JSON.');
  }
  return parseIconPack(data);
}
