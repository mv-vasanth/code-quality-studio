import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createVertexAuditMiddleware } from './server/vertexAudit.mjs'

// https://vite.dev/config/
export default defineConfig({
  // 4001, not vite's default 5173: `cqs serve` holds 4000, and the pair being
  // adjacent makes it obvious they belong together. strictPort so a silent
  // fallback to 4002 cannot break the companion's origin allowlist.
  server: { port: 4001, strictPort: true },
  preview: { port: 4002, strictPort: true },

  plugins: [
    react(),
    {
      name: 'vertex-audit-api',
      configureServer(server) {
        server.middlewares.use(createVertexAuditMiddleware())
      },
    },
  ],
})
