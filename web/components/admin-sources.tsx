import type { SourceHealthRow, SourcesResponse } from '@/lib/api';
import { useT } from '@/lib/i18n';
import type { TFunction } from '@/lib/i18n';

interface SourceCounts {
  requests: number;
  rate: number | null;
  timeouts: number;
  other: number;
  cuts: number;
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
    cuts: s.stageCuts ?? 0,
  };
}

function status(t: TFunction, s: SourceHealthRow): { text: string; tone: string } {
  if (s.coolingOff) return { text: t('Cooling off'), tone: 'var(--warn)' };
  if (s.failing) return { text: t('Failing'), tone: 'var(--err)' };
  if (!s.healthy) return { text: t('Recent failure'), tone: 'var(--warn)' };
  if (s.consecutiveUncounted > 0) return { text: t('Unclassified answers'), tone: 'var(--warn)' };
  return { text: t('Healthy'), tone: 'var(--ok)' };
}

function pct(rate: number | null): string {
  return rate === null ? '–' : `${(rate * 100).toFixed(1)}%`;
}

export function SourcesPanel({ data }: { data: SourcesResponse }) {
  const t = useT();
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
        {t('No source has been asked for a rating since this process started.')}
      </p>
    );
  }

  return (
    <div>
      <div className="admin-section">
        <div className="stat-strip">
          {([
            { label: t('Sources'), value: rows.length.toLocaleString() },
            { label: t('Requests'), value: total.requests.toLocaleString() },
            { label: t('Success rate'), value: pct(total.requests > 0 ? total.ok / total.requests : null) },
            { label: t('Timeouts'), value: total.timeouts.toLocaleString() },
            { label: t('Degraded'), value: data.degraded.toLocaleString() },
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
                <th scope="col">{t('Source')}</th>
                <th scope="col">{t('Requests')}</th>
                <th scope="col">{t('Success')}</th>
                <th scope="col">{t('Timeouts')}</th>
                <th scope="col">{t('Other failures')}</th>
                <th scope="col">{t('Unclassified')}</th>
                <th scope="col">{t('Cut off')}</th>
                <th scope="col">{t('Status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, c }) => {
                const st = status(t, s);
                return (
                  <tr key={s.source}>
                    <td><span className="mono">{s.source}</span></td>
                    <td>{c.requests.toLocaleString()}</td>
                    <td>{pct(c.rate)}</td>
                    <td>{c.timeouts.toLocaleString()}</td>
                    <td>{c.other.toLocaleString()}</td>
                    <td>{s.uncounted.toLocaleString()}</td>
                    <td>{c.cuts.toLocaleString()}</td>
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
        {t('Counts run from when this process started. Success is answers the source gave, empty ones included, out of every request counting unclassified answers, so a source refusing with a status nothing recognises reads low rather than perfect. Timeouts are split out of failures; other failures are errors, 5xx and rate limits. Cut off is fetches our own ratings deadline stopped waiting for; it lands on every source still in flight, so the slow one stands out by count, and it is not in the success rate. Hover a status for the last error.')}
      </p>
    </div>
  );
}
