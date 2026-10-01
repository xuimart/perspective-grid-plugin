@echo off
setlocal
title Perspective Grid - instalador da versao de teste (CEP)
set "SRC=%~dp0com.xuimart.perspectivegrid.cep"
set "DEST=%APPDATA%\Adobe\CEP\extensions\com.xuimart.perspectivegrid.cep"

if not exist "%SRC%\CSXS\manifest.xml" (
  echo Nao encontrei a pasta com.xuimart.perspectivegrid.cep ao lado deste arquivo.
  echo Extraia o ZIP inteiro numa pasta e rode o Instalar.cmd de dentro dela.
  pause
  exit /b 1
)

echo Copiando o Perspective Grid para:
echo   %DEST%
if exist "%DEST%" rmdir /s /q "%DEST%"
xcopy "%SRC%" "%DEST%\" /e /i /q /y >nul
if errorlevel 1 (
  echo Falha ao copiar os arquivos.
  pause
  exit /b 1
)

rem Paineis CEP sem assinatura da Adobe so carregam com o PlayerDebugMode ligado.
rem CSXS 8 = Photoshop CC 2018, 9 = 2019/2020. Os outros cobrem as versoes seguintes.
for %%v in (6 7 8 9 10 11 12 13 14 15) do reg add "HKCU\Software\Adobe\CSXS.%%v" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul

echo.
echo Pronto.
echo 1. Feche o Photoshop por completo e abra de novo.
echo 2. Abra em Janela ^> Extensoes ^> Perspective Grid
echo    No Photoshop 2022 ou mais novo o menu se chama Extensoes (legado).
echo.
pause
