import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // y-monaco imports from 'monaco-editor/esm/vs/editor/editor.api.js'
      // which Rolldown can't resolve. Alias the deep ESM path to the package root.
      'monaco-editor/esm/vs/editor/editor.api.js': path.resolve(
        import.meta.dirname,
        'node_modules/monaco-editor/esm/vs/editor/editor.api.js'
      ),
    },
  },
  server: {
    proxy: {
      // Forward /api requests (including WebSocket upgrades) to FastAPI
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        ws: true,
      },
      // Forward /ws requests (LSP, terminal, etc.) to FastAPI
      '/ws': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
