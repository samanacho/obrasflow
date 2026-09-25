@echo off
rem Arranca el conector de WhatsApp de ObrasFlow y lo vuelve a levantar si se cae.
rem Lo ejecuta al iniciar Windows el acceso "ObrasFlow conector WhatsApp.vbs" de la
rem carpeta Inicio (shell:startup). Log en logs\conector-whatsapp.log.
cd /d "%~dp0.."
if not exist logs mkdir logs
:loop
echo [%date% %time%] Iniciando conector >> logs\conector-whatsapp.log
"C:\Program Files\nodejs\node.exe" --env-file-if-exists=.env.local --import tsx worker/whatsapp-baileys.mts >> logs\conector-whatsapp.log 2>&1
echo [%date% %time%] El conector se detuvo; reinicio en 15 s >> logs\conector-whatsapp.log
timeout /t 15 /nobreak >nul
goto loop
