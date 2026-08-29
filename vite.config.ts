import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const controlPort = process.env.MIRA_FORGE_PORT || '47831'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 47832,
    strictPort: false,
    proxy: {
      '/api': `http://127.0.0.1:${controlPort}`,
    },
  },
})
