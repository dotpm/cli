import { axiom } from '@2bad/axiom'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [axiom],
  rules: {
    'jsdoc/require-param': 'off',
    'jsdoc/require-returns': 'off'
  }
})
