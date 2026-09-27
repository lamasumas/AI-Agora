import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // The charting, graph and editor libraries dominate the bundle and change
        // rarely, so give them their own chunks: the app chunk stays small and
        // browsers keep the vendor chunks cached across deploys.
        manualChunks: {
          charts: ['recharts'],
          graph: ['vis-network/standalone'],
          editor: [
            '@codemirror/state',
            '@codemirror/view',
            '@codemirror/commands',
            '@codemirror/language',
            '@codemirror/search',
          ],
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  server: {
    // Reachable from a container or a remote dev box; the production build is
    // served by FastAPI instead.
    host: '0.0.0.0',
    port: 5173,
    // In dev the SPA runs on Vite and the API on uvicorn, so forward /api.
    // In production both are served by FastAPI on one origin.
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
