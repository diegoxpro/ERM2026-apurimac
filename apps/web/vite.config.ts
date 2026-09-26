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
    // a CommonJS; sin esto Vite lo sirve como archivo crudo y el navegador no puede
    // interpretar sus "exports.x = ..." como exports nombrados de ES modules.
    include: ['@erm2026/shared'],
  },
  server: {
    port: 5173,
  },
});
