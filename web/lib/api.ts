import { getAdminKey } from './admin-key';
import { getRenderKey } from './render-key';

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  (typeof window !== 'undefined' ? '' : 'http://localhost:8787');

/** Authorization header for admin endpoints, from the session admin key. */
export function adminAuthHeaders(adminKey?: string): Record<string, string> {
  const key = adminKey ?? getAdminKey();
  return key ? { Authorization: `Bearer ${key}` } : {};
}

/** Whether this instance currently requires an admin key we don't have. */
export async function adminAccessStatus(adminKey?: string): Promise<'open' | 'locked' | 'unreachable'> {
  try {
    const res = await fetch(`${base()}/api/admin/metrics`, { headers: adminAuthHeaders(adminKey) });
    return res.status === 401 ? 'locked' : 'open';
  } catch {
    return 'unreachable';
  }
}

export type MediaType = 'poster' | 'backdrop' | 'thumbnail' | 'logo';

export interface Profile {
  id: string;
  name: string;
  alias?: string;
  type: string;
  uuid?: string;
  config: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
  hasPassword?: boolean;
  /** Names of the providers this profile has its own API key for. The values
   *  never leave the server, so only the names come back. */
  keysSet?: string[];
  /** Changes on every edit; artwork URLs carry it so downstream image caches
   *  see a new URL rather than serving the old render. */
  versionToken?: string;
}

function profilePasswordHeaders(password?: string): Record<string, string> {
  return password ? { 'X-Profile-Password': password } : {};
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
  if (typeof window !== 'undefined') return process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
  return API_BASE;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${base()}/healthz`);
  if (!res.ok) throw new Error(`health check failed: ${res.status}`);
  return res.json() as Promise<HealthResponse>;
}

/** The origin-relative part of a render URL. */
export function renderPath(
  type: MediaType,
  id: string,
  config?: string,
  key?: string,
  keysFrom?: string,
): string {
  const params = new URLSearchParams();
  if (config) params.set('config', config);
  // On an instance with XRDB_API_KEY set, render routes require the key.
  // URLSearchParams appends it as a proper &key= arg — no double-? footgun.
  if (key) params.set('key', key);
  // When previewing unsaved edits to a saved profile, name it so the server
  // applies that profile's own provider keys to this inline render. The preview
  // is same-origin, which is where the server accepts this.
  if (keysFrom) params.set('pk', keysFrom);
  const qs = params.toString();
  return `/${type}/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`;
}

export function renderUrl(
  type: MediaType,
  id: string,
  config?: string,
  key?: string,
  keysFrom?: string,
): string {
  return `${base()}${renderPath(type, id, config, key, keysFrom)}`;
}

/** Authorization header carrying the instance render key, when the operator
 *  has entered one. Profile routes require it on a keyed instance. */
export function renderAuthHeaders(): Record<string, string> {
  const key = getRenderKey();
  return key ? { Authorization: `Bearer ${key}` } : {};
}

// The render key gate runs before the profile-password check, so only a route
// that never reads an existing profile can attribute its 401 to the key alone.
const NEEDS_RENDER_KEY =
  'Unauthorized — this instance has an API key set. Enter it under the Install tab.';
const NEEDS_KEY_OR_PASSWORD =
  'Unauthorized — wrong profile password, or this instance needs its API key (Install tab).';

export interface CreateProfileInput {
  id?: string;
  name?: string;
  alias?: string;
  type: string;
  config: Record<string, unknown>;
  password?: string; // hashed server-side, never stored in plaintext
}

export async function createProfile(data: CreateProfileInput): Promise<Profile> {
  const res = await fetch(`${base()}/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...renderAuthHeaders() },
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new Error(NEEDS_RENDER_KEY);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `create profile failed: ${res.status}`);
  }
  return res.json() as Promise<Profile>;
}

export async function getProfile(idOrAlias: string, password?: string): Promise<Profile> {
  const res = await fetch(`${base()}/profile/${encodeURIComponent(idOrAlias)}`, {
    headers: { ...renderAuthHeaders(), ...profilePasswordHeaders(password) },
  });
  if (res.status === 401) throw new Error(NEEDS_KEY_OR_PASSWORD);
  if (res.status === 404) throw new Error('no profile found with that ID or alias');
  if (!res.ok) throw new Error(`get profile failed: ${res.status}`);
  return res.json() as Promise<Profile>;
}

export async function updateProfile(
  id: string,
  data: Partial<Profile> & { password?: string; providerKeys?: Record<string, string> },
  currentPassword?: string,
): Promise<Profile> {
  const res = await fetch(`${base()}/profile/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...renderAuthHeaders(), ...profilePasswordHeaders(currentPassword) },
    body: JSON.stringify(data),
  });
  if (res.status === 401) throw new Error(NEEDS_KEY_OR_PASSWORD);
  if (!res.ok) {
    const text = await res.text();
    // The server answers a refused save with a sentence written for the person
    // reading it; show that rather than the JSON around it.
    try {
      const body = JSON.parse(text) as { error?: string };
      if (body.error) throw new Error(body.error);
    } catch (e) {
      if (e instanceof Error && e.message && !e.message.startsWith('Unexpected')) throw e;
    }
    throw new Error(text || `update profile failed: ${res.status}`);
  }
  return res.json() as Promise<Profile>;
}

export async function deleteProfile(id: string, password?: string): Promise<void> {
  const res = await fetch(`${base()}/profile/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { ...renderAuthHeaders(), ...profilePasswordHeaders(password) },
  });
  if (res.status === 401) throw new Error(NEEDS_KEY_OR_PASSWORD);
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(text || `delete profile failed: ${res.status}`);
  }
}

export async function exportProfile(id: string, password?: string): Promise<ExportEnvelope> {
  const res = await fetch(`${base()}/profile/${encodeURIComponent(id)}/export`, {
    headers: { ...renderAuthHeaders(), ...profilePasswordHeaders(password) },
  });
  if (res.status === 401) throw new Error(NEEDS_KEY_OR_PASSWORD);
  if (!res.ok) throw new Error(`export failed: ${res.status}`);
  return res.json() as Promise<ExportEnvelope>;
}

export async function importProfiles(envelope: ExportEnvelope): Promise<{ imported: number; skipped: number; errors?: string[] }> {
  const res = await fetch(`${base()}/profile/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...renderAuthHeaders() },
    body: JSON.stringify(envelope),
  });
  if (res.status === 401) throw new Error(NEEDS_RENDER_KEY);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `import failed: ${res.status}`);
  }
  return res.json() as Promise<{ imported: number; skipped: number; errors?: string[] }>;
}

export async function fetchMetrics(): Promise<MetricsSnapshot> {
  const res = await fetch(`${base()}/api/admin/metrics`, { headers: adminAuthHeaders() });
  if (!res.ok) throw new Error(`metrics failed: ${res.status}`);
  return res.json() as Promise<MetricsSnapshot>;
}

export async function fetchCacheStats(): Promise<CacheStats> {
  const res = await fetch(`${base()}/api/admin/cache`, { headers: adminAuthHeaders() });
  if (!res.ok) throw new Error(`cache stats failed: ${res.status}`);
  return res.json() as Promise<CacheStats>;
}

// ── Log level ──────────────────────────────────────────────────────────────

export interface LogLevelState {
  /** The level in force right now. */
  level: string;
  /** Which layer supplied it: 'stored' | 'environment' | 'default'. */
  source: string;
  /** Accepted level names, least to most severe. */
  levels: string[];
  /** Value of XRDB_LOG_LEVEL, or '' when unset. */
  env: string;
  /** Whether a change can outlive a restart. */
  persisted: boolean;
}

export async function fetchLogLevel(): Promise<LogLevelState> {
  const res = await fetch(`${base()}/api/admin/log-level`, { headers: adminAuthHeaders() });
  if (!res.ok) throw new Error(`log level fetch failed: ${res.status}`);
  return res.json() as Promise<LogLevelState>;
}

export async function setLogLevel(level: string): Promise<LogLevelState> {
  const res = await fetch(`${base()}/api/admin/log-level`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
    body: JSON.stringify({ level }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text.trim() || `set log level failed: ${res.status}`);
  }
  return res.json() as Promise<LogLevelState>;
}

export async function clearLogLevel(): Promise<LogLevelState> {
  const res = await fetch(`${base()}/api/admin/log-level`, {
    method: 'DELETE',
    headers: adminAuthHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text.trim() || `clear log level failed: ${res.status}`);
  }
  return res.json() as Promise<LogLevelState>;
}

// ── Memory limit ─────────────────────────────────────────────────────────────

export interface MemoryLimitState {
  /** Soft heap limit in MiB; 0 means no limit. */
  limitMb: number;
  /** 'stored' | 'environment' | 'default'. */
  source: string;
  /** Value of XRDB_MEMORY_LIMIT_MB, or '' when unset. */
  env: string;
  persisted: boolean;
}

export async function fetchMemoryLimit(): Promise<MemoryLimitState> {
  const res = await fetch(`${base()}/api/admin/memory-limit`, { headers: adminAuthHeaders() });
  if (!res.ok) throw new Error(`memory limit fetch failed: ${res.status}`);
  return res.json() as Promise<MemoryLimitState>;
}

export async function setMemoryLimit(limitMb: number): Promise<MemoryLimitState> {
  const res = await fetch(`${base()}/api/admin/memory-limit`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
    body: JSON.stringify({ limitMb }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text.trim() || `set memory limit failed: ${res.status}`);
  }
  return res.json() as Promise<MemoryLimitState>;
}

export async function clearMemoryLimit(): Promise<MemoryLimitState> {
  const res = await fetch(`${base()}/api/admin/memory-limit`, {
    method: 'DELETE',
    headers: adminAuthHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text.trim() || `clear memory limit failed: ${res.status}`);
  }
  return res.json() as Promise<MemoryLimitState>;
}

// ── Provider cache TTLs ──────────────────────────────────────────────────────

export interface TTLEntry {
  provider: string;
  hours: number;
  /** 'stored' | 'environment' | 'default'. */
  source: string;
}

export async function fetchTTLs(): Promise<TTLEntry[]> {
  const res = await fetch(`${base()}/api/admin/ttls`, { headers: adminAuthHeaders() });
  if (!res.ok) throw new Error(`ttls fetch failed: ${res.status}`);
  return res.json() as Promise<TTLEntry[]>;
}

export async function setTTL(provider: string, hours: number): Promise<TTLEntry[]> {
  const res = await fetch(`${base()}/api/admin/ttls`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
    body: JSON.stringify({ provider, hours }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text.trim() || `set ttl failed: ${res.status}`);
  }
  return res.json() as Promise<TTLEntry[]>;
}

export async function clearTTL(provider: string): Promise<TTLEntry[]> {
  const res = await fetch(`${base()}/api/admin/ttls?provider=${encodeURIComponent(provider)}`, {
    method: 'DELETE',
    headers: adminAuthHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text.trim() || `clear ttl failed: ${res.status}`);
  }
  return res.json() as Promise<TTLEntry[]>;
}

// ── Settings (integrations) ────────────────────────────────────────────────

export interface SettingStatus {
  key: string;
  set: boolean;
  /** Where the value comes from: "stored" or "environment". Absent when unset. */
  source?: string;
}

export async function fetchSettings(adminKey?: string): Promise<SettingStatus[]> {
  const res = await fetch(`${base()}/api/admin/settings`, { headers: adminAuthHeaders(adminKey) });
  if (!res.ok) throw new Error(`settings fetch failed: ${res.status}`);
  return res.json() as Promise<SettingStatus[]>;
}

export async function setSetting(key: string, value: string, adminKey?: string): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...adminAuthHeaders(adminKey) };
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
  const res = await fetch(`${base()}/api/admin/settings?key=${encodeURIComponent(key)}`, {
    method: 'DELETE',
    headers: adminAuthHeaders(adminKey),
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

export interface GenreFamily {
  id: string;
  label: string;
  accent: string;
}

// The families and their built-in accents come from the renderer's own table,
// so a changed default reaches the configurator's swatches without an edit here.
export async function fetchGenreFamilies(): Promise<GenreFamily[]> {
  const res = await fetch(`${base()}/api/genre-families`);
  if (!res.ok) throw new Error(`genre families fetch failed: ${res.status}`);
  return res.json() as Promise<GenreFamily[]>;
}

export async function fetchTemplates(): Promise<Template[]> {
  const res = await fetch(`${base()}/api/templates`);
  if (!res.ok) throw new Error(`templates fetch failed: ${res.status}`);
  return res.json() as Promise<Template[]>;
}

// ── Media search / trending ────────────────────────────────────────────────

export interface TitleResult {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number;
}

/**
 * An error carrying the HTTP status, so a caller can tell one failure from
 * another. The trending and lookup endpoints answer 503 when no TMDB key is
 * configured and 502 when the request to TMDB itself failed; collapsing those
 * into one message sends a self-hoster to check a key that is working.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function searchTitles(q: string): Promise<TitleResult[]> {
  const res = await fetch(`${base()}/api/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new ApiError(`search failed: ${res.status}`, res.status);
  return res.json() as Promise<TitleResult[]>;
}

export async function trendingTitles(): Promise<TitleResult[]> {
  const res = await fetch(`${base()}/api/trending`);
  if (!res.ok) throw new ApiError(`trending failed: ${res.status}`, res.status);
  return res.json() as Promise<TitleResult[]>;
}

export async function lookupIMDbID(mediaType: 'movie' | 'tv', tmdbId: number): Promise<string> {
  const res = await fetch(`${base()}/api/lookup?type=${mediaType}&id=${tmdbId}`);
  if (!res.ok) throw new Error(`lookup failed: ${res.status}`);
  const data = await res.json() as { imdbId: string };
  return data.imdbId;
}

/** Resolves a TitleResult to the best render ID (IMDb tt-ID preferred). */
export async function renderIDFor(t: TitleResult): Promise<string> {
  try {
    const imdb = await lookupIMDbID(t.mediaType, t.tmdbId);
    if (imdb) return imdb;
  } catch (err) {
    console.warn('IMDb lookup failed, falling back to the TMDB id', err);
  }
  // A bare number is read as a TMDB movie id, so a series would render whatever
  // movie shares its number. The scheme carries the content type.
  return `tmdb:${t.mediaType === 'tv' ? 'series' : 'movie'}:${t.tmdbId}`;
}

// ── AIOMetadata install ────────────────────────────────────────────────────

export interface AIOMInstallInput {
  baseUrl: string;
  userUUID: string;
  password: string;
  addonPassword?: string;
  posterUrlPattern: string;
  backgroundUrlPattern: string;
  logoUrlPattern: string;
  episodeThumbnailUrlPattern: string;
}

export async function installToAIOM(input: AIOMInstallInput): Promise<{ installUrl: string; message: string }> {
  const res = await fetch(`${base()}/api/aiometadata/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => null) as { installUrl?: string; message?: string; error?: string } | null;
  if (!res.ok) throw new Error(data?.error || `install failed: ${res.status}`);
  return { installUrl: data?.installUrl ?? '', message: data?.message ?? 'Installed' };
}

/** Origin used in shareable artwork URLs (the API the images are served from). */
export function renderOrigin(): string {
  const envBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (envBase) return envBase;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

/** Result of translating a v2 config into the shape v3 renders from. */
export interface MigrateResult {
  config: Record<string, unknown>;
  read: number;
  converted?: string[];
  /** Settings kept on the profile but with no v3 control yet. */
  carriedUntouched?: string[];
}

/** Translates a v2 artwork URL, its query string, or its JSON into a v3 config. */
export async function migrateLegacyConfig(input: string): Promise<MigrateResult> {
  const res = await fetch(`${base()}/api/migrate/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...renderAuthHeaders() },
    body: JSON.stringify({ input }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error || `Could not read that (${res.status})`);
  }
  return body as MigrateResult;
}
