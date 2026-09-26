@echo off
rem Inicia sesion en Claude Code en esta PC (la usa el agente de WhatsApp en modo local).
rem Limpia variables heredadas de la app de Claude que redirigen la autenticacion.
title Iniciar sesion en Claude Code - ObrasFlow
for /f "tokens=1 delims==" %%v in ('set CLAUDE 2^>nul') do if /i not "%%v"=="CLAUDE_CODE_OAUTH_TOKEN" set "%%v="
set ANTHROPIC_BASE_URL=
set BAGGAGE=
set AI_AGENT=
echo.
echo  Se va a abrir el navegador para entrar con tu cuenta de Claude.
echo  Si la pagina te muestra un codigo, copialo y pegalo aca abajo (clic derecho pega) y Enter.
echo.
call "%APPDATA%\npm\claude.cmd" auth login
echo.
call "%APPDATA%\npm\claude.cmd" auth status
echo.
echo  Listo. Ya podes cerrar esta ventana.
pause
