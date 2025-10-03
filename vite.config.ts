import { livestoreDevtoolsPlugin } from '@livestore/devtools-vite'
import tailwindcss from '@tailwindcss/vite'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    livestoreDevtoolsPlugin({ schemaPath: './src/livestore/schema.ts' }),
    tailwindcss()
  ],
  worker: { format: 'es' },
})
