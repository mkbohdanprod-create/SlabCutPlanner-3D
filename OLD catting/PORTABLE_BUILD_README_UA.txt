SlabCutPlanner portable EXE (Electron)
=====================================

Що це:
Цей архів містить проєкт, підготовлений для збірки Windows portable EXE.

Щоб отримати SlabCutPlanner_portable.exe на Windows:
1. Встановіть Node.js LTS.
2. Розпакуйте архів.
3. Відкрийте папку проєкту.
4. Запустіть файл build-portable.bat

Або вручну в PowerShell / cmd:
1. npm install
2. npm run build:portable

Готовий EXE буде тут:
release\SlabCutPlanner_portable.exe

Режим розробки desktop:
1. npm install
2. npm run dev:desktop

Важливо:
- Це portable-версія без окремого інсталятора.
- Усі локальні дані й автозбереження залишаються в профілі Electron/Chromium.
- Збереження JSON-проєктів працює окремо через сам інтерфейс програми.
