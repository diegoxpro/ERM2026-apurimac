import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'ERM2026 Apurímac - Conteo Rápido',
        short_name: 'ERM2026',
        description: 'Digitación de actas para el conteo rápido no oficial de Apurímac 2026',
        theme_color: '#7c2d12',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
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
    port: 5173,
  },
});
