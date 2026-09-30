# NMR Figure Editor と ChemDraw をつなぐ (アプリの構造式ボタン → nmrfig-chemdraw: のリンク → これ)。
#  1. リンクの構造式を NMR の保存先の ChemDraw フォルダに書き、その写し (ChemDraw\editing) を ChemDraw で開く
#     (開いている ChemDraw があればその中に)。ChemDraw は開いた書類のファイルを開いたままにして、ほかから書き換えられない
#     (版 3 までは同じファイルを開いていたので、1 回目に書くところで止まり、直した構造式が図に入らなかった)
#  2. 描いている間、1 秒ごとに ChemDraw の中身を読み、変わっていればファイルに書く (アプリがそれを読んで図を直す)。
#     書いたら「変更あり」を消すので、閉じるときに保存を聞かれない。書けなかったときは次の回に書き直す
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
  # アプリが読むファイル (これだけが書く) と、ChemDraw が開く写し
  $path = Join-Path $dir "$name.cdxml"
  $work = Join-Path $dir 'editing'
  $workPath = Join-Path $work "$name.cdxml"
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
    # 前の版で開いた書類がまだ ChemDraw にあると、このファイルは書けない (その書類を見張り直す)
    try { [IO.File]::WriteAllText($path, $text, $utf8) } catch { if (-not (Test-Path -LiteralPath $path)) { throw } }
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
  $reopened = [bool]$doc
  if (-not $doc) {
    if (-not (Test-Path -LiteralPath $work)) {
      $w = New-Item -ItemType Directory -Force -Path $work
      try { $w.Attributes = $w.Attributes -bor [IO.FileAttributes]::Hidden } catch {}
    }
    # 前に開いた写しで、12 時間より古いものは片付ける (ChemDraw が開いたままのものは消せないので残る)
    foreach ($f in @(Get-ChildItem -LiteralPath $work -File -Force)) {
      if (((Get-Date) - $f.LastWriteTime).TotalHours -gt 12) { try { $f.Delete() } catch {} }
    }
    [IO.File]::Copy($path, $workPath, $true)
    $doc = $app.Documents.Open($workPath)
  }
  try { $doc.Activate() } catch {}
  try { (New-Object -ComObject WScript.Shell).AppActivate('ChemDraw') | Out-Null } catch {}
  if (-not $owner) { Log "already watching $name"; exit 0 }
  Log "open $name"
  # 前に閉じたときの印・書きかけが残っていれば消す (アプリはこの印を見てファイルを片付ける)
  $closed = Join-Path $dir "$name.closed"
  foreach ($old in @($closed, "$path.tmp")) { if (Test-Path $old) { Remove-Item -Force $old } }

  # もう開いていた書類 (前の見張りが途中で止まった、など) は、ChemDraw に見えている中身を図に入れ直す
  $last = $null
  if (-not $reopened) { try { $last = [string]$doc.Objects.Data('chemical/x-cdxml') } catch {} }
  # アプリが読むファイルを書き換える。書けなければ false (アプリが読んでいる最中、前の版で開いた書類が ChemDraw にある、など)
  function Write-AppFile([string]$text) {
    $tmp = "$path.tmp"
    try {
      [IO.File]::WriteAllText($tmp, $text, $utf8)
      Move-Item -Force -LiteralPath $tmp -Destination $path
      return $true
    } catch {
      if (-not $script:writeFailed) { Log ("write retry: " + $_.Exception.Message.Trim()) }
      $script:writeFailed = $true
      return $false
    }
  }
  $writeFailed = $false
  # 書けていない最後の中身 (閉じたあとにもう一度書く)
  $pending = $null
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
    # 書けなかったら止まらずに次の回に書き直す (記録は続けて失敗した 1 回目だけ)
    if (-not (Write-AppFile $now)) { $pending = $now; continue }
    $writeFailed = $false
    $pending = $null
    $last = $now
    try { $doc.Modified = $false } catch {}
  }
  if ($pending) {
    # 閉じれば ChemDraw がファイルを放すので、最後の中身をもう一度書く
    for ($i = 0; $i -lt 10 -and -not (Write-AppFile $pending); $i++) { Start-Sleep -Milliseconds 500 }
  }
  Log "done $name ($state)"
  # 閉じた印: アプリが最後の中身を図に入れてから、この構造式のファイルと一緒に消す
  [IO.File]::WriteAllText($closed, (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss'), $utf8)
  if ($own) { try { if ($app.Documents.Count -eq 0) { $app.Quit() } } catch {} }
  # 閉じた・ChemDraw を終えたなら写しを消す (ChemDraw がファイルを放すまで少し待つ)
  if ($state -eq 'closed' -or $state -eq 'gone') {
    for ($i = 0; $i -lt 10 -and (Test-Path -LiteralPath $workPath); $i++) {
      try { [IO.File]::Delete($workPath) } catch { Start-Sleep -Milliseconds 500 }
    }
  }
  $mutex.ReleaseMutex()
} catch {
  Log ("error: " + $_.Exception.Message)
  exit 1
}
