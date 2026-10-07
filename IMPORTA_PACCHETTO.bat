@echo off
setlocal
cd /d "%~dp0"
title Il Secchione - importa pacchetti
rem Uso: trascina uno o piu' file .zip (o .json) di pacchetti su questo file.

set "NODE_EXE="
if exist "%~dp0runtime\node.exe" set "NODE_EXE=%~dp0runtime\node.exe"
if not defined NODE_EXE (
  where node >nul 2>nul && set "NODE_EXE=node"
)
if not defined NODE_EXE (
  echo Node.js non e' installato: importa il pacchetto dalla regia
  echo ^(pulsante PACCHETTI, poi IMPORTA PACCHETTO^). Vedi RISOLUZIONE_PROBLEMI.html.
  pause
  goto :eof
)
if "%~1"=="" (
  echo Trascina il file .zip del pacchetto su IMPORTA_PACCHETTO.bat
  echo oppure importalo dalla regia: pulsante PACCHETTI, poi IMPORTA PACCHETTO.
  echo.
  "%NODE_EXE%" "%~dp0tools\pack_manager.js" list
  pause
  goto :eof
)
"%NODE_EXE%" "%~dp0tools\pack_manager.js" import %*
echo.
echo Fatto. Nella regia apri PACCHETTI per attivarlo.
pause
