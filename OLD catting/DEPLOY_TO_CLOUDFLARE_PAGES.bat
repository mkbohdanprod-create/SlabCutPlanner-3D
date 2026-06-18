@echo off
setlocal
cd /d "%~dp0"

echo Deploying SlabCutPlanner to Cloudflare Pages...
echo.
echo If Cloudflare asks to log in, confirm login in the browser window.
echo.

"C:\Program Files\nodejs\npx.cmd" wrangler pages deploy cloudflare-upload --project-name slabcutplanner --branch main

echo.
pause
