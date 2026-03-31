import { parseNonNegativeInt } from './imageRouteConfig.ts';

export const resolveSharpRuntimeOptions = (env: NodeJS.ProcessEnv = process.env) => {
  const concurrency = parseNonNegativeInt(env.XRDB_SHARP_CONCURRENCY);
  const memory = parseNonNegativeInt(env.XRDB_SHARP_CACHE_MEMORY_MB);
  const files = parseNonNegativeInt(env.XRDB_SHARP_CACHE_FILES);
  const items = parseNonNegativeInt(env.XRDB_SHARP_CACHE_ITEMS);

  return {
    concurrency: concurrency !== null && concurrency > 0 ? concurrency : 2,
    cacheOptions: {
      memory: memory !== null ? memory : 128,
      files: files !== null ? files : 200,
      items: items !== null ? items : 100,
    },
  };
};

const configureSharp = (sharp: any, env: NodeJS.ProcessEnv = process.env) => {
  if (!sharp) return;
  const runtimeOptions = resolveSharpRuntimeOptions(env);
  sharp.concurrency(runtimeOptions.concurrency);
  sharp.cache(runtimeOptions.cacheOptions);
};

export const createSharpFactoryLoader = ({
  env = process.env,
  importer = () => import('sharp'),
}: {
  env?: NodeJS.ProcessEnv;
  importer?: () => Promise<any>;
} = {}) => {
  let sharpFactoryPromise: Promise<any | null> | null = null;
  let sharpConfigured = false;

  return async () => {
    if (!sharpFactoryPromise) {
      sharpFactoryPromise = importer()
        .then((mod: any) => {
          const sharp = mod.default || mod;
          if (!sharpConfigured) {
            sharpConfigured = true;
            configureSharp(sharp, env);
          }
          return sharp;
        })
        .catch((error) => {
          throw new Error(
            `sharp is required for XRDB image rendering: ${error instanceof Error ? error.message : 'unknown error'}`
          );
        });
    }
    return sharpFactoryPromise;
  };
};
