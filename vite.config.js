import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createVertexAuditMiddleware } from './server/vertexAudit.mjs'

// https://vite.dev/config/
export default defineConfig({
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
