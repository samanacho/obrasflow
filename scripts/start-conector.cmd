@echo off
rem Arranca ObrasFlow local (base de datos, app y conector de WhatsApp) y lo vuelve a levantar si se cae.
rem VIEJO: el arranque con Windows ya no lo lanza (ahora usa start-local.cmd; ver
rem docs\entorno.md). Ojo: levanta un conector con la misma sesion de WhatsApp que
rem Memby de produccion. Log en logs\conector-whatsapp.log.
cd /d "%~dp0.."
if not exist logs mkdir logs
rem Node instalado en la ruta de siempre; si no esta ahi, el "node" del PATH.
if exist "C:\Program Files\nodejs\node.exe" (set "NODE=C:\Program Files\nodejs\node.exe") else (set "NODE=node")
:loop
echo [%date% %time%] Iniciando ObrasFlow local >> logs\conector-whatsapp.log
"%NODE%" scripts\local-stack.mjs >> logs\conector-whatsapp.log 2>&1
echo [%date% %time%] ObrasFlow local se detuvo; reinicio en 15 s >> logs\conector-whatsapp.log
timeout /t 15 /nobreak >nul
goto loop
