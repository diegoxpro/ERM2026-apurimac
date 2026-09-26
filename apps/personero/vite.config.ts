import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Personeros ERM2026 Apurímac',
        short_name: 'Personeros',
        description: 'Registro de actas para personeros — Elecciones Regionales y Municipales 2026, Apurímac',
        theme_color: '#1f8a1f',
        background_color: '#f4f6f5',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // El shell de la app se cachea para funcionar offline; los datos (mesas,
        // cédulas, actas) se manejan aparte con Dexie/IndexedDB, no con el cache HTTP.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },
    }),
  ],
  optimizeDeps: {
    // @erm2026/shared es un paquete del monorepo (enlazado por workspaces) compilado
    // a CommonJS; sin esto el servidor de dev lo sirve como archivo crudo y el
    // navegador no puede interpretar sus "exports.x = ..." como exports nombrados.
    include: ['@erm2026/shared'],
  },
  build: {
    commonjsOptions: {
      // Mismo problema que optimizeDeps mas arriba, pero para el build de
      // produccion (Rollup): por defecto solo procesa node_modules, y un
      // paquete de workspace resuelve a su ruta real fuera de node_modules.
      include: [/packages\/shared/, /node_modules/],
    },
  },
  server: {
    port: 5174,
  },
});
