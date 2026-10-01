@echo off
setlocal
title Perspective Grid - desinstalar versao de teste (CEP)
set "DEST=%APPDATA%\Adobe\CEP\extensions\com.xuimart.perspectivegrid.cep"
if exist "%DEST%" (
  rmdir /s /q "%DEST%"
  echo Perspective Grid removido.
) else (
  echo O Perspective Grid nao estava instalado.
)
echo Feche e abra o Photoshop de novo.
pause
