import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Encaminha as chamadas /api para o servidor Express local durante o dev.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
