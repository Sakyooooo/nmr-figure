import { tr } from '../i18n';
/** 画面の SVG から操作用の要素 (data-ui) を取り除いた書き出し用の文字列 */
export function figureSvgString(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('[data-ui]').forEach((el) => el.remove());
  const [, , w, h] = (clone.getAttribute('viewBox') ?? '0 0 0 0').split(/\s+/).map(Number);
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  clone.removeAttribute('class');
  clone.removeAttribute('style');
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
}

export async function svgToPng(svgText: string, scale: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(tr('PNG を作れませんでした')))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * 図をクリップボードへ。対応していれば SVG (ベクター) も一緒に置く。
 * Word / PowerPoint (Microsoft 365) は SVG を優先して貼るので、拡大しても荒くならず、
 * 画像の圧縮設定の影響も受けない。戻り値は SVG も置けたか。
 */
export async function copyFigureToClipboard(svgText: string, png: Blob): Promise<boolean> {
  const supports = (ClipboardItem as unknown as { supports?: (type: string) => boolean }).supports;
  const withSvg = !!supports?.('image/svg+xml');
  const items: Record<string, Blob> = { 'image/png': png };
  if (withSvg) items['image/svg+xml'] = new Blob([svgText], { type: 'image/svg+xml' });
  try {
    await navigator.clipboard.write([new ClipboardItem(items)]);
    return withSvg;
  } catch (e) {
    if (!withSvg) throw e;
    // SVG を受け付けない環境では PNG だけ
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    return false;
  }
}

export function downloadBlob(blob: Blob, fileName: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function baseName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '');
}

/** Word などに書式付きで貼れるようにコピーする (貼り先が HTML を読めなければ text が使われる) */
export async function copyRichText(html: string, text: string) {
  await navigator.clipboard.write([
    new ClipboardItem({
      'text/html': new Blob([`<meta charset="utf-8">${html}`], { type: 'text/html' }),
      'text/plain': new Blob([text], { type: 'text/plain' }),
    }),
  ]);
}
