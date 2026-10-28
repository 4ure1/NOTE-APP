@echo off
title Relancer NOTE-APP avec Agent IA
cd /d "%~dp0"
echo ======================================================
echo    REDEMARRAGE DE NOTE-APP (AVEC AGENT IA ACTIF)
echo ======================================================
echo.
echo Fermeture des anciennes instances...
taskkill /F /IM electron.exe >nul 2>&1
timeout /t 1 >nul
echo Demarrage de l'application...
npm run dev
pause
