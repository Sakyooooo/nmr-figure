# 配布用の簡易サーバー。Node もインストールも要らない (Windows の PowerShell だけで動く)。
# 同じフォルダの app\ を http://localhost:<port>/ で配って、既定のブラウザで開く。
# 外には公開しない (127.0.0.1 だけで待ち受ける)。

$ErrorActionPreference = 'Stop'
$root = Join-Path $PSScriptRoot 'app'
if (-not (Test-Path (Join-Path $root 'index.html'))) {
  Write-Host 'app\index.html が見つかりません。フォルダごとコピーし直してください。' -ForegroundColor Red
  Read-Host '閉じるには Enter'
  exit 1
}

$types = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8';
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8'; '.svg' = 'image/svg+xml';
  '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.gif' = 'image/gif'; '.ico' = 'image/x-icon';
  '.wasm' = 'application/wasm'; '.woff' = 'font/woff'; '.woff2' = 'font/woff2'; '.ttf' = 'font/ttf'; '.map' = 'application/json';
  '.webmanifest' = 'application/manifest+json; charset=utf-8'
}

# 空いているポートを探す
$listener = $null
foreach ($port in 4173..4183) {
  try {
    $try = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
    $try.Start()
    $listener = $try
    break
  } catch {
    if ($try) { try { $try.Stop() } catch {} }
  }
}
if (-not $listener) {
  Write-Host '空いているポートがありません。開いている NMR図編集ソフトを閉じてから、もう一度試してください。' -ForegroundColor Red
  Read-Host '閉じるには Enter'
  exit 1
}

$url = "http://localhost:$port/"
Write-Host ''
Write-Host "  NMR図編集ソフト を $url で開きます" -ForegroundColor Green
Write-Host '  終わるときは、この黒い画面を閉じてください。' -ForegroundColor DarkGray
Write-Host ''
Start-Process $url

# 1接続ずつ返す簡単な HTTP。ブラウザは Connection: close で次をつなぎ直す
while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $client.NoDelay = $true
    $stream = $client.GetStream()
    $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII)
    $request = $reader.ReadLine()
    if (-not $request) { continue }
    # ヘッダーは読み飛ばす
    while ($true) { $line = $reader.ReadLine(); if ($null -eq $line -or $line -eq '') { break } }

    $path = ($request -split ' ')[1]
    if (-not $path) { $path = '/' }
    $path = ($path -split '\?')[0]
    $path = [System.Uri]::UnescapeDataString($path)
    if ($path -eq '/' -or $path -eq '') { $path = '/index.html' }
    # 上の階層へ出る指定は受け付けない
    $relative = $path.TrimStart('/').Replace('/', '\')
    $file = Join-Path $root $relative
    $full = [System.IO.Path]::GetFullPath($file)
    $inside = $full.StartsWith([System.IO.Path]::GetFullPath($root), [System.StringComparison]::OrdinalIgnoreCase)

    if ($inside -and (Test-Path $full -PathType Leaf)) {
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $type = $types[[System.IO.Path]::GetExtension($full).ToLower()]
      if (-not $type) { $type = 'application/octet-stream' }
      $head = "HTTP/1.1 200 OK`r`nContent-Type: $type`r`nContent-Length: $($bytes.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
    } else {
      $bytes = [System.Text.Encoding]::UTF8.GetBytes('not found')
      $head = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
    }
    $headBytes = [System.Text.Encoding]::ASCII.GetBytes($head)
    $stream.Write($headBytes, 0, $headBytes.Length)
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Flush()
  } catch {
    # 1つの接続で失敗しても止めない
  } finally {
    try { $client.Close() } catch {}
  }
}
