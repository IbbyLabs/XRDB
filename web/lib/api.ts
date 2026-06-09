const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  (typeof window !== 'undefined' ? '' : 'http://localhost:8787');

export type MediaType = 'poster' | 'backdrop' | 'thumbnail' | 'logo';

export interface Profile {
  id: string;
  name: string;
  type: string;
  uuid?: string;
  config: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExportEnvelope {
  version: number;
  profiles: Profile[];
}

export interface MetricsSnapshot {
  totalRequests: number;
  byStatus: Record<string, number>;
  byRoute: Record<string, number>;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  uptimeSeconds: number;
}

export interface CacheStats {
  hotEntries: number;
  diskEntries: number;
  dir: string;
  ttl: string;
  status?: string;
}

export interface HealthResponse {
  service: string;
  status: string;
  version: string;
}

function base(): string {
  if (typeof window !== 'undefined') return '';
  return API_BASE;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${base()}/healthz`);
  if (!res.ok) throw new Error(`health check failed: ${res.status}`);
  return res.json() as Promise<HealthResponse>;
}

export function renderUrl(type: MediaType, id: string, config?: string): string {
  const params = new URLSearchParams();
  if (config) params.set('config', config);
  const qs = params.toString();
  return `${base()}/${type}/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`;
}

export async function createProfile(data: Omit<Profile, 'version' | 'createdAt' | 'updatedAt'>): Promise<Profile> {
  const res = await fetch(`${base()}/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `create profile failed: ${res.status}`);
  }
  return res.json() as Promise<Profile>;
}

export async function getProfile(id: string): Promise<Profile> {
  const res = await fetch(`${base()}/profile/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`get profile failed: ${res.status}`);
  return res.json() as Promise<Profile>;
}

export async function updateProfile(id: string, data: Partial<Profile>): Promise<Profile> {
  const res = await fetch(`${base()}/profile/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `update profile failed: ${res.status}`);
  }
  return res.json() as Promise<Profile>;
}

export async function exportProfile(id: string): Promise<ExportEnvelope> {
  const res = await fetch(`${base()}/profile/${encodeURIComponent(id)}/export`);
  if (!res.ok) throw new Error(`export failed: ${res.status}`);
  return res.json() as Promise<ExportEnvelope>;
}

export async function importProfiles(envelope: ExportEnvelope): Promise<{ imported: number; skipped: number; errors?: string[] }> {
  const res = await fetch(`${base()}/profile/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(envelope),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `import failed: ${res.status}`);
  }
  return res.json() as Promise<{ imported: number; skipped: number; errors?: string[] }>;
}

export async function fetchProfiles(): Promise<Profile[]> {
  const res = await fetch(`${base()}/profile`);
  if (!res.ok) throw new Error(`list profiles failed: ${res.status}`);
  return res.json() as Promise<Profile[]>;
}

export async function fetchMetrics(): Promise<MetricsSnapshot> {
  const res = await fetch(`${base()}/api/admin/metrics`);
  if (!res.ok) throw new Error(`metrics failed: ${res.status}`);
  return res.json() as Promise<MetricsSnapshot>;
}

export async function fetchCacheStats(): Promise<CacheStats> {
  const res = await fetch(`${base()}/api/admin/cache`);
  if (!res.ok) throw new Error(`cache stats failed: ${res.status}`);
  return res.json() as Promise<CacheStats>;
}

// ── Settings (integrations) ────────────────────────────────────────────────

export interface SettingStatus {
  key: string;
  set: boolean;
}

export async function fetchSettings(adminKey?: string): Promise<SettingStatus[]> {
  const headers: Record<string, string> = {};
  if (adminKey) headers['Authorization'] = `Bearer ${adminKey}`;
  const res = await fetch(`${base()}/api/admin/settings`, { headers });
  if (!res.ok) throw new Error(`settings fetch failed: ${res.status}`);
  return res.json() as Promise<SettingStatus[]>;
}

export async function setSetting(key: string, value: string, adminKey?: string): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (adminKey) headers['Authorization'] = `Bearer ${adminKey}`;
  const res = await fetch(`${base()}/api/admin/settings`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ key, value }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `set setting failed: ${res.status}`);
  }
}

export async function deleteSetting(key: string, adminKey?: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (adminKey) headers['Authorization'] = `Bearer ${adminKey}`;
  const res = await fetch(`${base()}/api/admin/settings?key=${encodeURIComponent(key)}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `delete setting failed: ${res.status}`);
  }
}

// ── Templates ──────────────────────────────────────────────────────────────

export interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  config: Record<string, unknown>;
}

export async function fetchTemplates(): Promise<Template[]> {
  const res = await fetch(`${base()}/api/templates`);
  if (!res.ok) throw new Error(`templates fetch failed: ${res.status}`);
  return res.json() as Promise<Template[]>;
}
