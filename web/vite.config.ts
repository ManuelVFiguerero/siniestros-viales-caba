import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Todo (JS, CSS y datos) queda en un solo index.html que se abre con doble clic.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  resolve: {
    // Build "CSP" de MapLibre: el worker va aparte (lo incrustamos como blob en App.tsx).
    // La build por defecto arma el worker de una forma que se rompe al re-empaquetarla con Vite.
    alias: [{ find: /^maplibre-gl$/, replacement: 'maplibre-gl/dist/maplibre-gl-csp.js' }],
  },
})
