@echo off
rem Arranca SOLO la base de datos local de ObrasFlow (scripts\local.mjs con
rem --sin-web --sin-conector) y la vuelve a levantar si se cae.
rem No levanta la app ni el conector de WhatsApp, a proposito:
rem   - la app la sirve la copia principal en el puerto 80
rem     (E:\Desarrollos\ObrasFlow-versiones\iniciar-principal.cmd);
rem   - Memby (conector de WhatsApp) corre aparte contra produccion
rem     (E:\Desarrollos\ObrasFlow-versiones\iniciar-memby.cmd). Los dos conectores
rem     usan la misma sesion de WhatsApp (.baileys-auth\): si este levantara otro,
rem     se pisarian (ver worker\CLAUDE.md).
rem Uso:  start-local.cmd        -> modo dev
rem       start-local.cmd prod   -> modo compilado
rem Lo ejecuta al iniciar Windows el acceso "ObrasFlow conector WhatsApp.vbs" de la
rem carpeta Inicio (shell:startup), junto con iniciar-principal.cmd e
rem iniciar-memby.cmd. Log en logs\conector-whatsapp.log (si pasa de
rem 10 MB se guarda como conector-whatsapp.log.anterior y empieza uno nuevo).
cd /d "%~dp0.."
if not exist logs mkdir logs
rem Node instalado en la ruta de siempre; si no esta ahi, el "node" del PATH.
if exist "C:\Program Files\nodejs\node.exe" (set "NODE=C:\Program Files\nodejs\node.exe") else (set "NODE=node")
set "MODO=%~1"
if "%MODO%"=="" set "MODO=dev"
:loop
for %%F in (logs\conector-whatsapp.log) do if %%~zF GTR 10485760 move /y logs\conector-whatsapp.log logs\conector-whatsapp.log.anterior >nul
echo [%date% %time%] Iniciando ObrasFlow local (modo %MODO%) >> logs\conector-whatsapp.log
"%NODE%" scripts\local.mjs --%MODO% --sin-web --sin-conector >> logs\conector-whatsapp.log 2>&1
echo [%date% %time%] ObrasFlow local se detuvo; reinicio en 15 s >> logs\conector-whatsapp.log
timeout /t 15 /nobreak >nul
goto loop
