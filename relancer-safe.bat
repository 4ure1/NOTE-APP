@echo off
title Relancer NOTE-APP (dossier de test)
cd /d "%~dp0"
echo ======================================================
echo    REDEMARRAGE DE NOTE-APP SUR test-vault (DEV SAFE)
echo ======================================================
echo.
echo Demarrage de l'application sur le dossier de test...
npm run dev:safe
pause
