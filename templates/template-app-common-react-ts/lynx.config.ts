import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin'
import { defineConfig } from '@lynx-js/rspeedy'

export default defineConfig({
  output: {
    dataUriLimit: Infinity,
  },
  plugins: [
    pluginReactLynx(),
  ]
})
