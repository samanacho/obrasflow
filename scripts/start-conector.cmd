@echo off
rem Arranca ObrasFlow local (base de datos, app y conector de WhatsApp) y lo vuelve a levantar si se cae.
rem Lo ejecuta al iniciar Windows el acceso "ObrasFlow conector WhatsApp.vbs" de la
rem carpeta Inicio (shell:startup). Log en logs\conector-whatsapp.log.
cd /d "%~dp0.."
if not exist logs mkdir logs
:loop
echo [%date% %time%] Iniciando ObrasFlow local >> logs\conector-whatsapp.log
"C:\Program Files\nodejs\node.exe" scripts\local-stack.mjs >> logs\conector-whatsapp.log 2>&1
echo [%date% %time%] ObrasFlow local se detuvo; reinicio en 15 s >> logs\conector-whatsapp.log
timeout /t 15 /nobreak >nul
goto loop
