import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Región que se muestra en títulos y manifiesto (cada instancia la define al construir).
const REGION = process.env.VITE_REGION || 'Lambayeque';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'titulo-region',
      transformIndexHtml: (html) => html.replace(/Lambayeque/g, REGION),
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: `Panel Administrativo — ${REGION} 2026`,
        short_name: 'Panel ERM2026',
        description: `Conteo rápido no oficial — Segunda vuelta regional 2026, ${REGION}`,
        theme_color: '#1D428A',
        background_color: '#ffffff',
        display: 'standalone',
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
  define: {
    // Lo lee ELECCION en @erm2026/shared (títulos, selector de región, etc.).
    'process.env.VITE_REGION': JSON.stringify(REGION),
  },
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
