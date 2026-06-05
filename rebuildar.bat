@echo off
chcp 65001 >nul
title Atualizar interface - Fechamento de Caixa
cd /d "%~dp0"

echo ============================================
echo   Atualizando a interface do sistema...
echo ============================================
echo.

call npm run build

echo.
if exist "dist" (
  echo ---------------------------------------------
  echo  Pronto! A interface foi atualizada.
  echo  Se o sistema estiver aberto no navegador,
  echo  basta atualizar a pagina com F5.
  echo ---------------------------------------------
) else (
  echo  Algo deu errado. Veja as mensagens acima.
)
echo.
pause
