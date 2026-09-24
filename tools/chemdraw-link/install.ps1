# ChemDraw 連携を入れる / 外す (この PC のこのユーザーだけ。管理者の権限は要らない)
#  入れる: NMR の保存先を選ぶ → %LOCALAPPDATA%\NMRFigure\chemdraw-link に helper.ps1 と launch.vbs を置く →
#          nmrfig-chemdraw: のリンクを launch.vbs に向ける (HKCU\Software\Classes)
#  外す:   上の 2 つを消す
param([switch]$Uninstall)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$src = Split-Path -Parent $MyInvocation.MyCommand.Path
$dest = Join-Path $env:LOCALAPPDATA 'NMRFigure\chemdraw-link'
$key = 'HKCU:\Software\Classes\nmrfig-chemdraw'
$title = 'NMR Figure Editor - ChemDraw 連携'

if ($Uninstall) {
  if (Test-Path $key) { Remove-Item -Path $key -Recurse -Force }
  if (Test-Path $dest) { Remove-Item -Path $dest -Recurse -Force }
  [System.Windows.Forms.MessageBox]::Show('ChemDraw 連携を外しました。', $title) | Out-Null
  exit 0
}

# NMR の保存先 (アプリのホーム画面で開いているフォルダ) を選んでもらう
$configPath = Join-Path $dest 'config.json'
$current = ''
if (Test-Path $configPath) { try { $current = (Get-Content $configPath -Raw -Encoding UTF8 | ConvertFrom-Json).folder } catch {} }
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'NMR の保存先 (アプリのホーム画面で開いているフォルダ) を選んでください。その中の「ChemDraw」フォルダに構造式を置きます。'
$dialog.ShowNewFolderButton = $false
if ($current -and (Test-Path $current)) { $dialog.SelectedPath = $current }
$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true }
if ($dialog.ShowDialog($owner) -ne [System.Windows.Forms.DialogResult]::OK) { exit 1 }
$folder = $dialog.SelectedPath

New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item -Force (Join-Path $src 'helper.ps1') $dest
Copy-Item -Force (Join-Path $src 'launch.vbs') $dest
$json = @{ folder = $folder } | ConvertTo-Json
[IO.File]::WriteAllText($configPath, $json, (New-Object System.Text.UTF8Encoding($false)))

New-Item -Path $key -Force | Out-Null
Set-ItemProperty -Path $key -Name '(default)' -Value 'URL:NMR Figure Editor ChemDraw'
Set-ItemProperty -Path $key -Name 'URL Protocol' -Value ''
New-Item -Path "$key\shell\open\command" -Force | Out-Null
$vbs = Join-Path $dest 'launch.vbs'
Set-ItemProperty -Path "$key\shell\open\command" -Name '(default)' -Value ('wscript.exe "{0}" "%1"' -f $vbs)

[System.Windows.Forms.MessageBox]::Show(("ChemDraw 連携を入れました。`n`nNMR の保存先: {0}`n`nアプリで構造式ボタンを押すと ChemDraw が開きます。初めてのときは Edge が「開きますか」と聞くので、許可してください。" -f $folder), $title) | Out-Null
