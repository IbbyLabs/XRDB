import { assertSafeSourceUrl, fetchWithOneRedirect } from './networkSecurity.ts';
import { buildProxyManifestPayload } from './proxyManifest.ts';

type LoadProxyManifestPayloadOptions = {
  sourceUrl: string;
  catalogPlan?: string | null;
  configSeed?: string;
  fetchWithOneRedirectImpl?: typeof fetchWithOneRedirect;
};

type LoadProxyManifestPayloadResult =
  | {
      ok: true;
      payload: Record<string, unknown>;
    }
  | {
      ok: false;
      error: 'invalid-source' | 'unreachable' | 'bad-status' | 'invalid-json';
      status?: number;
    };

export const loadProxyManifestPayload = async ({
  sourceUrl,
  catalogPlan = null,
  configSeed,
  fetchWithOneRedirectImpl = fetchWithOneRedirect,
}: LoadProxyManifestPayloadOptions): Promise<LoadProxyManifestPayloadResult> => {
  let safeSourceUrl: URL;
  try {
    safeSourceUrl = await assertSafeSourceUrl(sourceUrl);
  } catch {
    return { ok: false, error: 'invalid-source' };
  }

  let manifestResponse: Response;
  try {
    manifestResponse = await fetchWithOneRedirectImpl(safeSourceUrl.toString());
  } catch {
    return { ok: false, error: 'unreachable' };
  }

  if (!manifestResponse.ok) {
    return { ok: false, error: 'bad-status', status: manifestResponse.status };
  }

  let manifest: Record<string, unknown>;
  try {
    manifest = (await manifestResponse.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: 'invalid-json' };
  }

  return {
    ok: true,
    payload: buildProxyManifestPayload(manifest, sourceUrl, { catalogPlan, configSeed }),
  };
};