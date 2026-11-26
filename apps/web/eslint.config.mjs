import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import noComments from './eslint-rules/no-comments.mjs'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ['**/*.{js,jsx,ts,tsx,mjs,cjs}'],
    plugins: { local: { rules: { 'no-comments': noComments } } },
    rules: { 'local/no-comments': 'error' },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
])

export default eslintConfig
