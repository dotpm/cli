import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsdown'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  entry: { dotpm: 'source/main.ts' },
  outDir: 'build',
  format: 'es',
  platform: 'node',
  target: 'node22',
  fixedExtension: false,
  dts: false,
  publint: true,
  hash: false,
  define: { __CLI_VERSION__: JSON.stringify(version) }
})
