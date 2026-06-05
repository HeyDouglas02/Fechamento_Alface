@echo off
chcp 65001 >nul
title Fechamento de Caixa - Alface e Melancia
cd /d "%~dp0"

echo ============================================
echo   Fechamento de Caixa - Alface e Melancia
echo ============================================
echo.

REM Instala as dependencias na primeira vez.
if not exist "node_modules" (
  echo Instalando dependencias ^(so na primeira vez^)...
  call npm install
  echo.
)

REM Gera a interface ^(build^) se ainda nao existir.
if not exist "dist" (
  echo Gerando a interface...
  call npm run build
  echo.
)

echo Abrindo o sistema no navegador...
echo Para ENCERRAR, feche esta janela.
echo.

REM Sobe o servidor ^(API + interface na mesma porta^) e abre o navegador.
set ABRIR_NAVEGADOR=1
node server/index.js

pause
