const DEFAULT_RING_SIZE = 500;
const STRIP_EXTENSION_RE = /\.(?:jpe?g|png|webp|avif)$/i;
const AUTH_STRIP_PARAMS = new Set(['xrdbKey', 'xrdb_key']);

type RecentRingGlobal = typeof globalThis & {
  __xrdbPosterRecentRing?: string[];
  __xrdbPosterRecentSet?: Set<string>;
};

const getRingGlobal = () => globalThis as RecentRingGlobal;

export const recordRecentPosterRequest = (rawId: string, searchParams: URLSearchParams, maxSize = DEFAULT_RING_SIZE) => {
  const id = rawId.replace(STRIP_EXTENSION_RE, '');
  if (!id) return;

  const clean = new URLSearchParams(searchParams);
  for (const key of AUTH_STRIP_PARAMS) {
    clean.delete(key);
  }

  const entry = `${id}\t${clean.toString()}`;
  const g = getRingGlobal();
  if (!g.__xrdbPosterRecentRing) {
    g.__xrdbPosterRecentRing = [];
    g.__xrdbPosterRecentSet = new Set();
  }
  const ring = g.__xrdbPosterRecentRing;
  const set = g.__xrdbPosterRecentSet!;
  if (set.has(entry)) return;
  if (ring.length >= maxSize) {
    const evicted = ring.shift()!;
    set.delete(evicted);
  }
  ring.push(entry);
  set.add(entry);
};

export const getRecentPosterEntries = (limit: number): Array<{ id: string; searchParams: URLSearchParams }> => {
  const ring = getRingGlobal().__xrdbPosterRecentRing ?? [];
  return ring.slice(-Math.max(0, limit)).map((entry) => {
    const tabIdx = entry.indexOf('\t');
    if (tabIdx === -1) return { id: entry, searchParams: new URLSearchParams() };
    return { id: entry.slice(0, tabIdx), searchParams: new URLSearchParams(entry.slice(tabIdx + 1)) };
  });
};

export const clearRecentPosterRingForTests = () => {
  const g = getRingGlobal();
  g.__xrdbPosterRecentRing = [];
  g.__xrdbPosterRecentSet = new Set();
};
