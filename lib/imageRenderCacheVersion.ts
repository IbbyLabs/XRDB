// Single source of truth for the image render cache version.
// Bumped on every release by scripts/bump-final-render-cache-version.mjs — do not edit the
// version string by hand.
//
// The full token keys the server-side render cache. IMAGE_URL_CACHE_TOKEN (the numeric
// suffix) is appended to image URLs as `v=` so a release also busts CDN and browser caches,
// which key on the URL: the render-cache-version bump alone re-renders on the origin but the
// unchanged URL keeps serving the stale cached image until its ~7-day TTL expires.
export const FINAL_IMAGE_RENDERER_CACHE_VERSION = 'poster-backdrop-logo-v154';

export const IMAGE_URL_CACHE_TOKEN =
  FINAL_IMAGE_RENDERER_CACHE_VERSION.match(/v(\d+)$/)?.[1] ?? FINAL_IMAGE_RENDERER_CACHE_VERSION;
