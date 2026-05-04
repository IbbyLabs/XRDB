import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: [
    'app/**/{page,layout,route,error,loading,not-found,template,default}.{ts,tsx}',
    'app/api/**/*.{ts,tsx}',
    'next.config.ts',
    'postcss.config.mjs',
    'eslint.config.mjs',
    'scripts/**/*.{mjs,ts}',
    'tests/**/*.mjs',
  ],
  project: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}'],
  ignore: ['.next/**', 'node_modules/**'],
  ignoreDependencies: ['@types/*', 'tailwindcss', 'eslint-config-next'],
  ignoreBinaries: ['powershell'],
  ignoreIssues: {
    'lib/configProfileAuth.ts': ['exports'],
    'lib/configuratorPageOptions.ts': ['exports'],
    'lib/dbQueryRuntime.ts': ['exports'],
    'lib/imageObjectStorage.ts': ['exports'],
    'lib/imageObjectStoragePaths.ts': ['exports'],
    'lib/imageRouteTorrentio.ts': ['exports'],
    'lib/imdbDatasetScheduler.ts': ['exports'],
    'lib/metadataStore.ts': ['exports'],
    'lib/posterCacheWarmScheduler.ts': ['exports'],
    'lib/sqliteStore.ts': ['exports'],
  },
};

export default config;
