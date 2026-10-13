// Vite config — https://vitejs.dev/config/
// Figma Make-ə aid plugin-lər (site.json, error overlay, refresh boundary, make-kit) çıxarılıb.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// Backend (API Lab server). Dev rejimində bu prefikslər ora yönləndirilir — CORS lazım olmur.
const API_TARGET = process.env.API_TARGET ?? 'http://localhost:3000'
const proxied = ['/api', '/oauth', '/bff', '/docs']

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173, // OAuth redirect_uri (http://localhost:5173/oauth/callback) seed-də bu porta qeydiyyatlıdır
    strictPort: true,
    proxy: Object.fromEntries(proxied.map((prefix) => [prefix, { target: API_TARGET, changeOrigin: false }])),
  },
  preview: {
    port: 4173,
  },
})
