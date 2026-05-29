/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { getBuildId } from './scripts/build-id.mjs'

// Plugin que injeta a referencia a __BUILD_ID__ no entry point do bundle.
function buildIdPlugin() {
  return {
    name: 'build-id',
    transform(code, id) {
      if (id.endsWith('main.jsx')) {
        return { code: 'globalThis.__app_build_id__ = __BUILD_ID__\n' + code }
      }
    },
  }
}

export default defineConfig({
  plugins: [buildIdPlugin(), react(), tailwindcss()],
  base: '/',
  define: {
    __BUILD_ID__: JSON.stringify(getBuildId()),
  },
  build: {
    sourcemap: false,
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.{js,jsx}', 'src/**/*.test.{js,jsx}'],
  },
})
