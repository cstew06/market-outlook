import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      // Forward this browser request to FastAPI during local development.
      '/health': 'http://127.0.0.1:8000',
    },
  },
})
