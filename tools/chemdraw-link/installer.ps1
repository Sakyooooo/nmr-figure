# ChemDraw 連携を入れる / 外す (この PC のこのユーザーだけ。管理者の権限は要らない)
#  入れる: %LOCALAPPDATA%\NMRFigure\chemdraw-link に helper.ps1 と launch.vbs を置き、nmrfig-chemdraw: のリンクを launch.vbs に向ける
#          (HKCU\Software\Classes)。NMR の保存先の ChemDraw フォルダに .nmrfig-link.json を置く (アプリはこれで連携できたと知る)
#  外す:   上を消す
# 呼び方:
#  - アプリの「ChemDraw と連携する」が作る ChemDraw連携を入れる.cmd (NMR の保存先の ChemDraw フォルダに置く。中にこのスクリプトと
#    helper.ps1・launch.vbs が入っている)。置かれた場所から NMR の保存先がわかるので、フォルダは聞かない
#  - このフォルダの ChemDraw連携を入れる.bat / 外す.bat (NMR の保存先を聞く)
# 変数 (呼ぶ側が決める): $NmrfigSelf = 呼んだファイル、$NmrfigHelper / $NmrfigVbs = 中身 (base64。なければ隣のファイル)、
#   $NmrfigUninstall = 外す。環境変数 NMRFIG_DRYRUN があれば、レジストリに触らず %TEMP% に書く (試験用)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$title = 'NMR Figure Editor - ChemDraw'
$dry = [bool]$env:NMRFIG_DRYRUN
function Say([string]$text, [string]$buttons = 'OK') {
  if ($dry) { Write-Output "SAY: $text"; return 'Yes' }
  $owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true }
  return [string][System.Windows.Forms.MessageBox]::Show($owner, $text, $title, $buttons)
}

if (-not (Get-Variable NmrfigSelf -ErrorAction SilentlyContinue) -or -not $NmrfigSelf) { $NmrfigSelf = $PSCommandPath }
$srcDir = Split-Path -Parent $NmrfigSelf
$base = if ($dry) { Join-Path $env:TEMP 'nmrfig-dryrun' } else { $env:LOCALAPPDATA }
$dest = Join-Path $base 'NMRFigure\chemdraw-link'
$configPath = Join-Path $dest 'config.json'
$key = 'HKCU:\Software\Classes\nmrfig-chemdraw'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Remove-Link([string]$folder) {
  if (-not $dry -and (Test-Path $key)) { Remove-Item -Path $key -Recurse -Force }
  if ($folder) { $marker = Join-Path $folder 'ChemDraw\.nmrfig-link.json'; if (Test-Path $marker) { Remove-Item -Force $marker } }
  if (Test-Path $dest) { Remove-Item -Path $dest -Recurse -Force }
}

$current = ''
if (Test-Path $configPath) { try { $current = (Get-Content $configPath -Raw -Encoding UTF8 | ConvertFrom-Json).folder } catch {} }

if ((Get-Variable NmrfigUninstall -ErrorAction SilentlyContinue) -and $NmrfigUninstall) {
  Remove-Link $current
  Say "ChemDraw 連携を外しました。`nThe ChemDraw link was removed." | Out-Null
  exit 0
}

# NMR の保存先: ChemDraw フォルダの中から呼ばれたらその親。そうでなければ選んでもらう
if ((Split-Path $srcDir -Leaf) -eq 'ChemDraw') {
  $folder = Split-Path $srcDir -Parent
} else {
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = "NMR の保存先 (アプリのホーム画面で開いているフォルダ) を選んでください。`nChoose your NMR folder (the one open on the app's home screen)."
  $dialog.ShowNewFolderButton = $false
  if ($current -and (Test-Path $current)) { $dialog.SelectedPath = $current }
  if ($dry) { $folder = $env:NMRFIG_DRYRUN }
  else {
    $owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true }
    if ($dialog.ShowDialog($owner) -ne [System.Windows.Forms.DialogResult]::OK) { exit 1 }
    $folder = $dialog.SelectedPath
  }
}

# 同じフォルダにもう入っていれば、入れ直すか外すかを聞く
if ($current -eq $folder -and (Test-Path (Join-Path $folder 'ChemDraw\.nmrfig-link.json'))) {
  $answer = Say "ChemDraw 連携はもう入っています。`n  はい: 入れ直す   いいえ: 外す`n`nThe ChemDraw link is already installed.`n  Yes: reinstall   No: remove" 'YesNoCancel'
  if ($answer -eq 'Cancel') { exit 1 }
  if ($answer -eq 'No') {
    Remove-Link $folder
    Say "ChemDraw 連携を外しました。`nThe ChemDraw link was removed." | Out-Null
    exit 0
  }
}

New-Item -ItemType Directory -Force -Path $dest | Out-Null
function Put([string]$name, $b64) {
  $target = Join-Path $dest $name
  if ($b64) { [IO.File]::WriteAllBytes($target, [Convert]::FromBase64String($b64)) }
  else { Copy-Item -Force (Join-Path $srcDir $name) $target }
}
Put 'helper.ps1' $(if (Get-Variable NmrfigHelper -ErrorAction SilentlyContinue) { $NmrfigHelper } else { $null })
Put 'launch.vbs' $(if (Get-Variable NmrfigVbs -ErrorAction SilentlyContinue) { $NmrfigVbs } else { $null })
[IO.File]::WriteAllText($configPath, (@{ folder = $folder } | ConvertTo-Json), $utf8)

if (-not $dry) {
  New-Item -Path $key -Force | Out-Null
  Set-ItemProperty -Path $key -Name '(default)' -Value 'URL:NMR Figure Editor ChemDraw'
  Set-ItemProperty -Path $key -Name 'URL Protocol' -Value ''
  New-Item -Path "$key\shell\open\command" -Force | Out-Null
  Set-ItemProperty -Path "$key\shell\open\command" -Name '(default)' -Value ('wscript.exe "{0}" "%1"' -f (Join-Path $dest 'launch.vbs'))
}

# アプリが「連携できた」と知るための印
$cdDir = Join-Path $folder 'ChemDraw'
New-Item -ItemType Directory -Force -Path $cdDir | Out-Null
# version: アプリの LINK_VERSION (chemdraw.ts) と合わせる。2 = 閉じた印を置く
$marker = @{ version = 2; installed = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss') } | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $cdDir '.nmrfig-link.json'), $marker, $utf8)

Say ("ChemDraw 連携を入れました。`nNMR の保存先: {0}`n`nアプリで構造式ボタンを押すと ChemDraw が開きます。初めてのときは Edge が「開きますか」と聞くので、許可してください。`n`nThe ChemDraw link is installed. Press the structure button in the app to open ChemDraw." -f $folder) | Out-Null
