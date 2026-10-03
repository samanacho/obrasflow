@echo off
rem Arranca la base de datos local de ObrasFlow. La app la sirve la principal en el
rem puerto 80 (E:\Desarrollos\ObrasFlow-versiones\iniciar-principal.cmd) y el conector
rem de WhatsApp trabaja contra Vercel (E:\Desarrollos\ObrasFlow-versiones\iniciar-memby.cmd). Con el
rem servidor nuevo (scripts\local.mjs) y lo vuelve a levantar si se cae.
rem Uso:  start-local.cmd        -> modo dev (recarga en caliente, para el rediseño)
rem       start-local.cmd prod   -> modo compilado (más liviano para el uso diario)
rem Lo ejecuta al iniciar Windows el acceso "ObrasFlow conector WhatsApp.vbs" de la
rem carpeta Inicio (shell:startup). Log en logs\conector-whatsapp.log (si pasa de
rem 10 MB se guarda como conector-whatsapp.log.anterior y empieza uno nuevo).
cd /d "%~dp0.."
if not exist logs mkdir logs
set "MODO=%~1"
if "%MODO%"=="" set "MODO=dev"
:loop
for %%F in (logs\conector-whatsapp.log) do if %%~zF GTR 10485760 move /y logs\conector-whatsapp.log logs\conector-whatsapp.log.anterior >nul
echo [%date% %time%] Iniciando ObrasFlow local (modo %MODO%) >> logs\conector-whatsapp.log
"C:\Program Files\nodejs\node.exe" scripts\local.mjs --%MODO% --sin-web --sin-conector >> logs\conector-whatsapp.log 2>&1
echo [%date% %time%] ObrasFlow local se detuvo; reinicio en 15 s >> logs\conector-whatsapp.log
timeout /t 15 /nobreak >nul
goto loop
