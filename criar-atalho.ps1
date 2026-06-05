# criar-atalho.ps1 — cria um atalho do sistema na Área de Trabalho.
# Funciona em qualquer PC: usa a própria pasta onde está salvo (não depende de
# um caminho fixo). Gera também o ícone (.ico) a partir da logo.

$ErrorActionPreference = 'Stop'
$dir = $PSScriptRoot
$bat = Join-Path $dir 'iniciar.bat'
$logo = Join-Path $dir 'public\logo.jpg'
$ico  = Join-Path $dir 'public\logo.ico'

# Gera o .ico a partir da logo (se a logo existir e o ico ainda não).
if ((Test-Path $logo) -and -not (Test-Path $ico)) {
  Add-Type -AssemblyName System.Drawing
  $img = [System.Drawing.Image]::FromFile($logo)
  $bmp = New-Object System.Drawing.Bitmap 256, 256
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.DrawImage($img, 0, 0, 256, 256)
  $g.Dispose(); $img.Dispose()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $png = $ms.ToArray(); $ms.Dispose()
  $fs = [System.IO.File]::Create($ico)
  $bw = New-Object System.IO.BinaryWriter $fs
  $bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]1)
  $bw.Write([Byte]0); $bw.Write([Byte]0); $bw.Write([Byte]0); $bw.Write([Byte]0)
  $bw.Write([UInt16]1); $bw.Write([UInt16]32)
  $bw.Write([UInt32]$png.Length); $bw.Write([UInt32]22)
  $bw.Write($png); $bw.Flush(); $fs.Close()
}

$ws = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$lnk = $ws.CreateShortcut((Join-Path $desktop 'Fechamento de Caixa.lnk'))
$lnk.TargetPath = $bat
$lnk.WorkingDirectory = $dir
$lnk.Description = 'Abrir o sistema de Fechamento de Caixa - Alface Melancia e Cia.'
$lnk.WindowStyle = 1
if (Test-Path $ico) { $lnk.IconLocation = "$ico,0" }
$lnk.Save()

Write-Host 'Atalho "Fechamento de Caixa" criado na Area de Trabalho.' -ForegroundColor Green
