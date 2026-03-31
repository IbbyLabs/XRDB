import { defineConfig } from 'eslint/config';
import next from 'eslint-config-next';

const nextConfig = Array.isArray(next) ? next : [next];

const eslintConfig = defineConfig([
  ...nextConfig,
  {
    ignores: ['.next/**', 'coverage/**', 'loadtest/**'],
  },
]);

export default eslintConfig;
