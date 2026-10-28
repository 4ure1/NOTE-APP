@echo off
title Relancer NOTE-APP (dossier de test)
cd /d "%~dp0"
echo ======================================================
echo    REDEMARRAGE DE NOTE-APP SUR test-vault (DEV SAFE)
echo ======================================================
echo.
echo Fermeture des anciennes instances...
taskkill /F /IM electron.exe >nul 2>&1
timeout /t 1 >nul
echo Demarrage de l'application sur le dossier de test...
npm run dev:safe
pause
