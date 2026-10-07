@echo off
setlocal
cd /d "%~dp0"
title Il Secchione - server locale (non chiudere durante la lezione)

rem 1) Node portatile nella cartella runtime\ (facoltativo)  2) Node installato sul PC
set "NODE_EXE="
if exist "%~dp0runtime\node.exe" set "NODE_EXE=%~dp0runtime\node.exe"
if not defined NODE_EXE (
  where node >nul 2>nul && set "NODE_EXE=node"
)
if not defined NODE_EXE goto nonode

"%NODE_EXE%" -e "process.exit(+process.versions.node.split('.')[0]>=8?0:1)" >nul 2>nul
if errorlevel 1 goto oldnode

"%NODE_EXE%" "%~dp0server\server.js" --open
if errorlevel 1 (
  echo.
  echo Il server si e' fermato con un errore: leggi il messaggio qui sopra.
  echo Puoi comunque giocare senza tablet con AVVIA_SENZA_TABLET.bat
  pause
)
goto :eof

:oldnode
echo.
echo La versione di Node.js installata e' troppo vecchia.
echo Installa la versione LTS da https://nodejs.org e riavvia questo file.
echo.
goto manual

:nonode
echo.
echo ============================================================
echo  Manca il motore del programma (cartella runtime).
echo ============================================================
echo  Di solito succede quando lo ZIP non e' stato estratto per intero.
echo  Chiudi questa finestra, fai clic destro sullo ZIP, "Estrai tutto",
echo  e avvia di nuovo AVVIA_IL_SECCHIONE dalla cartella estratta.
echo.
echo  Intanto puoi giocare SENZA TABLET: le risposte le registri tu.
echo  (vedi RISOLUZIONE_PROBLEMI.html)
echo ============================================================
echo.

:manual
echo Apro Il Secchione senza tablet...
start "" "%~dp0index.html"
pause
