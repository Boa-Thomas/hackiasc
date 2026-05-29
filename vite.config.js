/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { getBuildId } from './scripts/build-id.mjs'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
