# クリップボードに SVG (image/svg+xml) と PNG を置いて Word に貼り、何として貼られたかを調べる (開発用)
# 使い方: powershell -STA -File scripts/word-clip-check.ps1 -Svg a.svg -Png a.png [-SvgOnly]
# 別の非表示の Word を起動して使い、開いている文書には触れない。クリップボードの文字は最後に戻す
param(
  [Parameter(Mandatory = $true)][string]$Svg,
  [string]$Png = '',
  [switch]$SvgOnly
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$savedText = [System.Windows.Forms.Clipboard]::GetText()

$data = New-Object System.Windows.Forms.DataObject
$svgBytes = [System.IO.File]::ReadAllBytes((Resolve-Path $Svg).Path)
$data.SetData('image/svg+xml', (New-Object System.IO.MemoryStream(, $svgBytes)))
if ($Png -and -not $SvgOnly) {
  $pngBytes = [System.IO.File]::ReadAllBytes((Resolve-Path $Png).Path)
  $data.SetData('PNG', (New-Object System.IO.MemoryStream(, $pngBytes)))
}
[System.Windows.Forms.Clipboard]::SetDataObject($data, $true)

$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
  $doc = $word.Documents.Add()
  $doc.Range().Paste()
  # type 17 = SVG のグラフィック (ベクター)、3 = 画像 (ビットマップ)
  "inline shapes: $($doc.InlineShapes.Count)"
  foreach ($s in $doc.InlineShapes) { "  type=$($s.Type) size=$([math]::Round($s.Width))x$([math]::Round($s.Height))" }
}
finally {
  # 非表示の Word で保存や閉じる操作をすると止まることがあるので、保存せずに終了する
  $word.Quit(0)
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)
  if ($savedText) { [System.Windows.Forms.Clipboard]::SetText($savedText) } else { [System.Windows.Forms.Clipboard]::Clear() }
}
