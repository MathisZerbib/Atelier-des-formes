import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['favicon.svg', 'images/emoji-sucess.gif', 'images/emoji-no.gif'],
          devOptions: {
            enabled: true,
          },
          workbox: {
            globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
          },
          manifest: {
            name: 'Jeu de Formes Éducatif',
            short_name: 'Formes',
            description:
              "Un jeu éducatif de glisser-déposer où les enfants peuvent placer des formes colorées sur une aire de jeu.",
            start_url: '/',
            scope: '/',
            display: 'standalone',
            lang: 'fr',
            theme_color: '#0ea5e9',
            background_color: '#ffffff',
            icons: [
              // Use SVG favicon as a fallback for icons; for best install prompts, replace with PNGs (192/512) later.
              { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
            ],
          },
          // If you want to auto-generate icons from SVG, upgrade vite-plugin-pwa and enable pwaAssets here.
        }),
      ],
      define: {
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
