/**
 * The percent split of a combined score between rating sources.
 *
 * The renderer's rule, mirrored here so the panel shows what the poster will
 * actually do: a source's share is whatever the config set for it, and sources
 * the config left alone divide up whatever is left of the 100. An empty config
 * is therefore an even split without needing a case of its own.
 *
 * See resolveShares in internal/compose/badge_overlay.go.
 */

const TOTAL = 100;

/** Spread an amount over n slots as whole numbers that still add up to it. */
function spread(amount: number, ids: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (ids.length === 0) return out;
  const base = Math.floor(amount / ids.length);
  let spare = Math.round(amount - base * ids.length);
  for (const id of ids) {
    out[id] = base + (spare > 0 ? 1 : 0);
    if (spare > 0) spare--;
  }
  return out;
}

export function resolveShares(
  ids: string[],
  weights: Record<string, number>,
): Record<string, number> {
  const shares: Record<string, number> = {};
  const unset: string[] = [];
  let assigned = 0;
  for (const id of ids) {
    if (id in weights) {
      shares[id] = weights[id];
      assigned += weights[id];
    } else {
      unset.push(id);
    }
  }
  return { ...shares, ...spread(Math.max(0, TOTAL - assigned), unset) };
}

/**
 * Move one source to a new share and adjust the others to match, so the split
 * always totals 100. The others keep their sizes relative to each other, which
 * makes a single slider feel like it is taking from or giving to the rest as a
 * group rather than reshuffling them.
 */
export function rebalance(
  ids: string[],
  shares: Record<string, number>,
  id: string,
  next: number,
): Record<string, number> {
  const target = Math.max(0, Math.min(TOTAL, Math.round(next)));
  const others = ids.filter(o => o !== id);
  if (others.length === 0) return { [id]: TOTAL };

  const remaining = TOTAL - target;
  const othersTotal = others.reduce((sum, o) => sum + (shares[o] ?? 0), 0);
  if (othersTotal <= 0) return { [id]: target, ...spread(remaining, others) };

  const out: Record<string, number> = { [id]: target };
  for (const o of others) out[o] = Math.floor(((shares[o] ?? 0) / othersTotal) * remaining);

  // Flooring each share loses up to a point per source. Hand those back to the
  // largest ones so the column adds up to exactly 100 rather than 98.
  let drift = remaining - others.reduce((sum, o) => sum + out[o], 0);
  const biggestFirst = [...others].sort((a, b) => out[b] - out[a] || a.localeCompare(b));
  for (let i = 0; drift > 0; i++, drift--) out[biggestFirst[i % biggestFirst.length]] += 1;
  return out;
}

/**
 * Bring a stored split back in line with the selected sources after one is
 * added or removed. A source that has just been selected takes an even share
 * and the rest give way in proportion; a deselected one hands its share back.
 * Without this a newly selected source would sit on whatever is left of the
 * 100, which is nothing, and would silently not count.
 */
export function syncShares(
  ids: string[],
  weights: Record<string, number>,
): Record<string, number> {
  if (Object.keys(weights).length === 0) return {};
  if (ids.length === 0) return {};

  const even = TOTAL / ids.length;
  const raw = ids.map(id => (id in weights ? weights[id] : even));
  const total = raw.reduce((sum, v) => sum + v, 0);
  if (total <= 0) return {};

  const scaled: Record<string, number> = {};
  ids.forEach((id, i) => { scaled[id] = Math.floor((raw[i] / total) * TOTAL); });
  let drift = TOTAL - ids.reduce((sum, id) => sum + scaled[id], 0);
  const biggestFirst = [...ids].sort((a, b) => scaled[b] - scaled[a] || a.localeCompare(b));
  for (let i = 0; drift > 0; i++, drift--) scaled[biggestFirst[i % biggestFirst.length]] += 1;
  return scaled;
}
