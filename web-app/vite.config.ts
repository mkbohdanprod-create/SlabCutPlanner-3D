import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // ПРОТОТИП AR (27.08). iOS запускає Quick Look лише якщо файл
    // віддано з типом model/vnd.usdz+zip — dev-сервер за замовчуванням
    // цього не знає, і замість виробу телефон показує сміття.
    {
      name: 'usdz-mime',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url && req.url.endsWith('.usdz')) res.setHeader('Content-Type', 'model/vnd.usdz+zip');
          next();
        });
      },
    },
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      output: {
        // Блокувальники реклами (uBlock/AdGuard) ріжуть будь-який файл зі
        // словом «rrweb» у назві. Перейменовуємо чанк, щоб запис дій для
        // звіту про баг працював і в користувачів із блокувальником.
        chunkFileNames: (chunk: { name?: string }) =>
          `assets/${(chunk.name || 'chunk').replace(/rrweb/gi, 'srec')}-[hash].js`,
      },
    },
  },
  server: {
    allowedHosts: true,
    // У dev-режимі API (server/) працює окремо на :3000
    proxy: {
      '/api': 'http://localhost:3000',
      /*
       * ТИМЧАСОВО (26.08.2026): Stone WMS для пошуку залишків.
       * Ендпоінт /api/v1/stock на боці WMS ще в роботі — поки його немає,
       * запити чесно повертаються помилкою, і кнопка «Підібрати залишки»
       * каже «відповідь від WMS не отримана». Токен, коли з'явиться,
       * додається тут з оточення (process.env.WMS_STOCK_TOKEN) і в
       * браузер не потрапляє. У бою це буде наш бекенд, не vite.
       */
      '/wms': {
        target: 'https://stone-wms-bjqd.vercel.app',
        changeOrigin: true,
        rewrite: (p: string) => p.replace(/^\/wms/, ''),
        headers: process.env.WMS_STOCK_TOKEN
          ? { Authorization: `Bearer ${process.env.WMS_STOCK_TOKEN}` }
          : undefined,
      },
    },
  },
})
