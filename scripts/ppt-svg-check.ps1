# SVG を PowerPoint に挿入して「図形に変換」し、変換結果を確認する (開発用)
# 使い方: powershell -File scripts/ppt-svg-check.ps1 -Svg .dev-output/figure.svg
# 既に開いている PowerPoint のファイルには触れない (非表示の新規プレゼンテーションだけを使う)
param(
  [Parameter(Mandatory = $true)][string]$Svg,
  [string]$OutDir = '',
  # 図形に変換せず、Office が SVG をそのまま描いた結果を見る
  [switch]$NoConvert
)
$ErrorActionPreference = 'Stop'
$svgPath = (Resolve-Path $Svg).Path
if (-not $OutDir) { $OutDir = Join-Path $PSScriptRoot '..\.dev-output' }
$OutDir = (Resolve-Path $OutDir).Path
$name = [IO.Path]::GetFileNameWithoutExtension($svgPath)
$wasRunning = [bool](Get-Process POWERPNT -ErrorAction SilentlyContinue)

$app = New-Object -ComObject PowerPoint.Application
# 「図形に変換」はウィンドウ上の選択に対するコマンドなので、ウィンドウ付きで開く (最小化しておく)
$pres = $app.Presentations.Add(-1)
$win = $pres.Windows.Item(1)
try {
  $pres.PageSetup.SlideWidth = 720
  $pres.PageSetup.SlideHeight = 360
  $slide = $pres.Slides.Add(1, 12)  # 12 = 白紙
  $pic = $slide.Shapes.AddPicture($svgPath, 0, -1, 10, 10)
  "inserted: type=$($pic.Type) size=$([math]::Round($pic.Width))x$([math]::Round($pic.Height))"

  if (-not $NoConvert) {
    $win.Activate()
    $win.ViewType = 9   # 標準表示
    $pic.Select()
    $app.CommandBars.ExecuteMso('SVGEdit')   # 「図形に変換」
    Start-Sleep -Milliseconds 500
  }
  "converted: $($slide.Shapes.Count) top-level shape(s)"

  # 変換後の図形を集計する
  $stats = @{}
  $texts = New-Object System.Collections.Generic.List[string]
  function Walk($shape) {
    if ($shape.Type -eq 6) { foreach ($s in $shape.GroupItems) { Walk $s }; return }
    $key = "type$($shape.Type)"
    if ($shape.HasTextFrame -and $shape.TextFrame.HasText) {
      $key = 'text'
      $t = $shape.TextFrame.TextRange
      $runs = @()
      for ($i = 1; $i -le $t.Runs().Count; $i++) {
        $r = $t.Runs($i)
        $runs += ('[{0}|{1}pt|off={2}]' -f $r.Text, $r.Font.Size, $r.Font.BaselineOffset)
      }
      $texts.Add(("{0} | rot={1} | {2} | {3}" -f $t.Text, [math]::Round($shape.Rotation), $t.Font.Name, ($runs -join '')))
    }
    $stats[$key] = 1 + [int]$stats[$key]
  }
  foreach ($s in $slide.Shapes) { Walk $s }
  $stats.GetEnumerator() | Sort-Object Name | ForEach-Object { "  $($_.Name): $($_.Value)" }
  "texts:"
  $texts | Select-Object -First 40 | ForEach-Object { "  $_" }

  $suffix = if ($NoConvert) { '-raw' } else { '-ppt' }
  $slide.Export((Join-Path $OutDir "$name$suffix.png"), 'PNG', 1440, 720)
  $pres.SaveAs((Join-Path $OutDir "$name$suffix.pptx"))
  "saved: $name$suffix.png / $name$suffix.pptx"
}
finally {
  $pres.Close()
  if (-not $wasRunning) { $app.Quit() }
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($app)
}
