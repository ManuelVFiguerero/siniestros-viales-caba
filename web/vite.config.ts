import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base relativa para poder publicarlo en GitHub Pages bajo /<repo>/
export default defineConfig({
  plugins: [react()],
  base: './',
})
