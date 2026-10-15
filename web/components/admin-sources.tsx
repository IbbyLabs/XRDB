import type { SourceHealthRow, SourcesResponse } from '@/lib/api';

interface SourceCounts {
  requests: number;
  rate: number | null;
  timeouts: number;
  other: number;
}

/** Success rate counts unclassified answers as not successes. */
export function sourceCounts(s: SourceHealthRow): SourceCounts {
  const requests = s.successes + s.failures + s.uncounted;
  const timeouts = s.timeouts ?? 0;
  return {
    requests,
    rate: requests > 0 ? s.successes / requests : null,
    timeouts,
    other: Math.max(0, s.failures - timeouts),
  };
}

function status(s: SourceHealthRow): { text: string; tone: string } {
  if (s.coolingOff) return { text: 'Cooling off', tone: 'var(--warn)' };
  if (s.failing) return { text: 'Failing', tone: 'var(--err)' };
  if (!s.healthy) return { text: 'Recent failure', tone: 'var(--warn)' };
  if (s.consecutiveUncounted > 0) return { text: 'Unclassified answers', tone: 'var(--warn)' };
  return { text: 'Healthy', tone: 'var(--ok)' };
}

function pct(rate: number | null): string {
  return rate === null ? '–' : `${(rate * 100).toFixed(1)}%`;
}

export function SourcesPanel({ data }: { data: SourcesResponse }) {
  const rows = data.sources
    .map(s => ({ s, c: sourceCounts(s) }))
    .sort((a, b) => b.c.requests - a.c.requests);
  const total = rows.reduce(
    (t, { s, c }) => ({ requests: t.requests + c.requests, ok: t.ok + s.successes, timeouts: t.timeouts + c.timeouts }),
    { requests: 0, ok: 0, timeouts: 0 },
  );

  if (rows.length === 0) {
    return (
      <p className="page-sub" style={{ margin: 0 }}>
        No source has been asked for a rating since this process started.
      </p>
    );
  }

  return (
    <div>
      <div className="admin-section">
        <div className="stat-strip">
          {([
            { label: 'Sources', value: rows.length.toLocaleString() },
            { label: 'Requests', value: total.requests.toLocaleString() },
            { label: 'Success rate', value: pct(total.requests > 0 ? total.ok / total.requests : null) },
            { label: 'Timeouts', value: total.timeouts.toLocaleString() },
            { label: 'Degraded', value: data.degraded.toLocaleString() },
          ]).map(({ label, value }) => (
            <div key={label} className="stat-cell">
              <span className="stat-label">{label}</span>
              <span className="stat-value">{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="admin-section">
        <div className="panel panel-table" style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Requests</th>
                <th scope="col">Success</th>
                <th scope="col">Timeouts</th>
                <th scope="col">Other failures</th>
                <th scope="col">Unclassified</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, c }) => {
                const st = status(s);
                return (
                  <tr key={s.source}>
                    <td><span className="mono">{s.source}</span></td>
                    <td>{c.requests.toLocaleString()}</td>
                    <td>{pct(c.rate)}</td>
                    <td>{c.timeouts.toLocaleString()}</td>
                    <td>{c.other.toLocaleString()}</td>
                    <td>{s.uncounted.toLocaleString()}</td>
                    <td title={(s.consecutiveUncounted > 0 ? s.lastUncountedError : s.lastError) || undefined}>
                      <span style={{ color: st.tone, fontWeight: 600 }}>{st.text}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="page-sub" style={{ margin: 'var(--sp-2) 0 0' }}>
        Counts run from when this process started. Success is answers the source gave, empty ones included, out of
        every request counting unclassified answers, so a source refusing with a status nothing recognises
        reads low rather than perfect. Timeouts are split out of failures; other failures are errors, 5xx
        and rate limits. Hover a status for the last error.
      </p>
    </div>
  );
}
