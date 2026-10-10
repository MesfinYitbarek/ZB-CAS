import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/cas/' : '/',
  plugins: [react()],
  server: { port: 3000, open: true },
}))