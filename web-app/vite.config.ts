import fs from 'node:fs'
import path from 'node:path'
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
    /*
     * СТАТИКА З public/ ЗА АДРЕСОЮ ТЕКИ (07.09.2026, №128).
     * Симптом: у dev `localhost:5173/lab/` показував… VS3D. Не краш, не
     * помилка в консолі — просто інша сторінка, тому й «вилітає назад у
     * Студію». Причина: dev-сервер Vite віддає public/ через `sirv` з
     * `extensions: []`, і запит на ТЕКУ (`/lab/`) не перетворюється на
     * `/lab/index.html`; далі спрацьовує SPA-fallback і повертає index.html
     * самого застосунку. У бою (Vercel) теки віддаються правильно, тому
     * баг видно тільки локально. Дописуємо те, чого бракує: якщо адреса
     * закінчується на «/» і в public/ лежить index.html — віддаємо його.
     */
    {
      name: 'public-dir-index',
      configureServer(server) {
        const publicDir = server.config.publicDir;
        server.middlewares.use((req, _res, next) => {
          const url = req.url?.split('?')[0] ?? '';
          if (publicDir && url.length > 1 && url.endsWith('/')) {
            const file = path.join(publicDir, url, 'index.html');
            if (file.startsWith(publicDir) && fs.existsSync(file)) {
              req.url = url + 'index.html' + (req.url!.includes('?') ? '?' + req.url!.split('?')[1] : '');
            }
          }
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
