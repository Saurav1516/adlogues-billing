import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // During development the API runs on port 4000; the app forwards /api calls to it.
    proxy: { '/api': 'http://localhost:4000' },
  },
})
