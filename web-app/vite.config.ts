import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    allowedHosts: true,
    // У dev-режимі API (server/) працює окремо на :3000
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
