type ProxyCatalogLoadState = 'ready' | 'error';

export type ProxyCatalogManifestLoadResult = {
  generatedProxyUrl: string;
  catalogManifest: Record<string, unknown> | null;
  catalogLoadState: ProxyCatalogLoadState;
  catalogLoadError: string;
};

const readErrorMessage = async (response: Response, fallback: string) => {
  const message = await response.text();
  return message || fallback;
};

export const loadProxyCatalogManifest = async (
  requestBody: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProxyCatalogManifestLoadResult> => {
  let generatedProxyUrl = '';

  try {
    const proxyRefResponse = await fetchImpl('/api/proxy-ref', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
      cache: 'no-store',
    });
    if (!proxyRefResponse.ok) {
      throw new Error(
        await readErrorMessage(
          proxyRefResponse,
          `Proxy ref request failed with ${proxyRefResponse.status}`,
        ),
      );
    }

    const proxyRef = (await proxyRefResponse.json()) as { url?: string };
    if (!proxyRef.url) {
      throw new Error('Proxy ref request did not return a URL.');
    }

    generatedProxyUrl = proxyRef.url;

    const manifestResponse = await fetchImpl(generatedProxyUrl, { cache: 'no-store' });
    if (!manifestResponse.ok) {
      throw new Error(
        await readErrorMessage(
          manifestResponse,
          `Manifest request failed with ${manifestResponse.status}`,
        ),
      );
    }

    const payload = await manifestResponse.json();
    return {
      generatedProxyUrl,
      catalogManifest: payload && typeof payload === 'object' ? payload : null,
      catalogLoadState: 'ready',
      catalogLoadError: '',
    };
  } catch (error) {
    return {
      generatedProxyUrl,
      catalogManifest: null,
      catalogLoadState: 'error',
      catalogLoadError:
        error instanceof Error ? error.message : 'Unable to load source catalogs.',
    };
  }
};