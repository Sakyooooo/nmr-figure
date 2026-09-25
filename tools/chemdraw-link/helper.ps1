# NMR Figure Editor と ChemDraw をつなぐ (アプリの構造式ボタン → nmrfig-chemdraw: のリンク → これ)。
#  1. リンクの構造式を NMR の保存先の ChemDraw フォルダに書き、ChemDraw で開く (開いている ChemDraw があればその中に)
#  2. 描いている間、1 秒ごとに ChemDraw の中身を読み、変わっていればファイルに書く (アプリがそれを読んで図を直す)。
#     書いたら「変更あり」を消すので、閉じるときに保存を聞かれない
#  3. 書類を閉じたら「閉じた」の印 (structure-….closed) を置いて終わる (自分で起動した ChemDraw は閉じる)。
#     アプリはこの印を見て、最後の中身を図に入れてからファイルを片付ける
# リンク: nmrfig-chemdraw:open?name=structure-<16進>&data=<deflate して base64url にした CDXML>
param([string]$Url)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$log = Join-Path $here 'helper.log'
function Log($m) { try { Add-Content -Path $log -Value ("{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $m) -Encoding UTF8 } catch {} }

try {
  $config = Get-Content (Join-Path $here 'config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if (-not ($Url -match '^nmrfig-chemdraw:(//)?open\?(.*)$')) { Log "bad url"; exit 1 }
  $query = @{}
  foreach ($pair in $Matches[2].Split('&')) {
    $kv = $pair.Split('=', 2)
    if ($kv.Length -eq 2) { $query[$kv[0]] = [Uri]::UnescapeDataString($kv[1]) }
  }
  $name = $query['name']
  # ほかのサイトから呼ばれても、決まった名前のファイルしか扱わない
  if (-not ($name -match '^structure-[0-9a-f]{8,32}$')) { Log "bad name"; exit 1 }
  $dir = Join-Path $config.folder 'ChemDraw'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $path = Join-Path $dir "$name.cdxml"
  $utf8 = New-Object System.Text.UTF8Encoding($false)

  # 同じ構造式をもう見ているときは、その書類を前に出すだけ
  $mutex = New-Object System.Threading.Mutex($false, "Local\nmrfig-chemdraw-$name")
  $owner = $mutex.WaitOne(0)

  if ($owner -and $query['data']) {
    $b64 = $query['data'].Replace('-', '+').Replace('_', '/')
    switch ($b64.Length % 4) { 2 { $b64 += '==' } 3 { $b64 += '=' } }
    $raw = New-Object System.IO.MemoryStream(, [Convert]::FromBase64String($b64))
    $inflate = New-Object System.IO.Compression.DeflateStream($raw, [System.IO.Compression.CompressionMode]::Decompress)
    $reader = New-Object System.IO.StreamReader($inflate, $utf8)
    $text = $reader.ReadToEnd()
    $reader.Close()
    if (-not ($text -match '<CDXML[\s>]')) { Log "data is not CDXML"; exit 1 }
    [IO.File]::WriteAllText($path, $text, $utf8)
  }
  if (-not (Test-Path $path)) { Log "no file $path"; exit 1 }

  # 開いている ChemDraw があればその中に開く。なければ起動する
  $own = $false
  try { $app = [Runtime.InteropServices.Marshal]::GetActiveObject('ChemDraw_x64.Application') }
  catch { $app = New-Object -ComObject ChemDraw_x64.Application; $own = $true }
  $app.Visible = $true

  # 書類はファイルの名前で探す。ChemDraw の FullName はフォルダ名の日本語を文字化けさせる
  # (「研究室データ」→「遐皮ｩｶ…」) ので、場所の文字列では見つからない。名前は structure-<16進> で他と重ならない
  $file = "$name.cdxml"
  function Find-Doc {
    foreach ($d in $app.Documents) { try { if ([string]$d.Name -eq $file) { return $d } } catch {} }
    return $null
  }
  # open = 開いている / closed = 閉じた / gone = ChemDraw を終えた /
  # busy = ChemDraw が答えない (描いている最中・ダイアログを出しているなど。閉じたとみなさない)
  function Doc-State {
    try {
      foreach ($d in $app.Documents) { if ([string]$d.Name -eq $file) { return 'open' } }
      return 'closed'
    } catch {
      $e = $_.Exception
      while ($e.InnerException) { $e = $e.InnerException }
      # RPC サーバーがない・切れた = ChemDraw が終わった
      if (@('800706BA', '800706BE', '80010108', '80010114') -contains ('{0:X8}' -f $e.HResult)) { return 'gone' }
      return 'busy'
    }
  }
  $doc = Find-Doc
  if (-not $doc) { $doc = $app.Documents.Open($path) }
  try { $doc.Activate() } catch {}
  try { (New-Object -ComObject WScript.Shell).AppActivate('ChemDraw') | Out-Null } catch {}
  if (-not $owner) { Log "already watching $name"; exit 0 }
  Log "open $name"
  # 前に閉じたときの印・書きかけが残っていれば消す (アプリはこの印を見てファイルを片付ける)
  $closed = Join-Path $dir "$name.closed"
  foreach ($old in @($closed, "$path.tmp")) { if (Test-Path $old) { Remove-Item -Force $old } }

  $last = $null
  try { $last = [string]$doc.Objects.Data('chemical/x-cdxml') } catch {}
  $started = Get-Date
  $closedCount = 0
  $busySince = $null
  while (((Get-Date) - $started).TotalHours -lt 12) {
    Start-Sleep -Milliseconds 900
    # 書類を閉じた・ChemDraw を終えたら終わる。ChemDraw が答えないだけのときは閉じたとみなさない
    # (閉じたとみなすと、アプリがファイルを片付けて ChemDraw が「ファイルがもうありません」と出す)
    $state = Doc-State
    if ($state -eq 'gone') { break }
    if ($state -eq 'busy') {
      if (-not $busySince) { $busySince = Get-Date }
      # 30 分答えなければあきらめる
      if (((Get-Date) - $busySince).TotalMinutes -gt 30) { break }
      continue
    }
    $busySince = $null
    if ($state -eq 'closed') {
      # 2 回続けて見えないときだけ閉じたとみなす
      $closedCount++
      if ($closedCount -ge 2) { break }
      continue
    }
    $closedCount = 0
    $now = $null
    try { $now = [string]$doc.Objects.Data('chemical/x-cdxml') } catch { continue }
    if (-not $now -or $now -eq $last) { continue }
    $tmp = "$path.tmp"
    [IO.File]::WriteAllText($tmp, $now, $utf8)
    Move-Item -Force -Path $tmp -Destination $path
    $last = $now
    try { $doc.Modified = $false } catch {}
  }
  Log "done $name ($state)"
  # 閉じた印: アプリが最後の中身を図に入れてから、この構造式のファイルと一緒に消す
  [IO.File]::WriteAllText($closed, (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss'), $utf8)
  if ($own) { try { if ($app.Documents.Count -eq 0) { $app.Quit() } } catch {} }
  $mutex.ReleaseMutex()
} catch {
  Log ("error: " + $_.Exception.Message)
  exit 1
}
