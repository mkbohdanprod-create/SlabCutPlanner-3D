@echo off
setlocal
cd /d %~dp0

echo Installing dependencies...
call npm install
if errorlevel 1 goto :fail

echo Building portable EXE...
call npm run build:portable
if errorlevel 1 goto :fail

echo.
echo Done.
echo Output file:
echo release\SlabCutPlanner_portable.exe
pause
exit /b 0

:fail
echo.
echo Build failed.
pause
exit /b 1
