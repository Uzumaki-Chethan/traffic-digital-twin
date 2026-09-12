import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// The backend dashboard server (FastAPI/uvicorn) runs on 127.0.0.1:8000 by
// default (backend/config.py: DASHBOARD_HOST / DASHBOARD_PORT). During
// `npm run dev` this proxies /api and /ws through to it so the browser only
// ever talks to one origin. The production build (frontend/dist) is served by
// dashboard_server.py itself, where the same relative paths work unchanged.
const BACKEND_ORIGIN = process.env.VITE_BACKEND_ORIGIN || 'http://127.0.0.1:8000'
const BACKEND_WS_ORIGIN = BACKEND_ORIGIN.replace(/^http/, 'ws')

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: BACKEND_ORIGIN, changeOrigin: true },
      '/ws': { target: BACKEND_WS_ORIGIN, ws: true },
    },
  },
})
