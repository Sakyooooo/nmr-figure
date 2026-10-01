/**
 * ChemDraw 連携を入れるファイル (ChemDraw連携を入れる.cmd と、その隣の installer.ps1・helper.ps1・launch.vbs) を作る。
 * どれも読める文章のまま置く。以前は 1 つの cmd に本体を base64 で隠し、PowerShell の iex で動かしていたが、
 * ウイルス対策ソフト (ESET) が「脅威」として削除した (友人が試した、2026-10-01)。隠して動かす形はマルウェアの運び屋と同じなので、やめた。
 * cmd は PowerShell に隣の installer.ps1 を渡すだけ。cmd は BOM や日本語で読み違えるので、cmd だけは ASCII にする
 */
export const LINK_INSTALLER_NAME = 'ChemDraw連携を入れる.cmd';

/** cmd の隣に置く台本 (installer.ps1 は隣の helper.ps1・launch.vbs を読む。この名前は installer.ps1 と合わせる) */
export const LINK_SCRIPT_NAMES = ['installer.ps1', 'helper.ps1', 'launch.vbs'];

/** 連携を入れるために置くファイルの名前 (全部。連携が入ったら片付ける) */
export const LINK_FILE_NAMES = [LINK_INSTALLER_NAME, ...LINK_SCRIPT_NAMES];

export interface LinkFile {
  name: string;
  text: string;
}

/** 改行を Windows の形 (CRLF) にそろえる (公開版は Linux でビルドするので LF になっている) */
const crlf = (s: string) => s.replace(/\r?\n/g, '\r\n');

/** ChemDraw連携を入れる.cmd の中身 (ASCII だけ) */
export function linkInstallerCmd(): string {
  return crlf(
    [
      '@echo off',
      'rem NMR Figure Editor - ChemDraw link installer (double-click to install).',
      'rem installer.ps1 (next to this file) is plain text: it copies helper.ps1 and launch.vbs to %LOCALAPPDATA%\\NMRFigure\\chemdraw-link',
      'rem and registers the nmrfig-chemdraw: link for the current user only (no administrator rights).',
      'powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0installer.ps1"',
      'if errorlevel 1 pause',
      '',
    ].join('\n'),
  );
}

/** 置くファイル全部 (ps1 は Windows PowerShell が日本語を読めるよう BOM 付きのまま) */
export function buildLinkFiles(parts: { installer: string; helper: string; vbs: string }): LinkFile[] {
  return [
    { name: LINK_INSTALLER_NAME, text: linkInstallerCmd() },
    { name: 'installer.ps1', text: crlf(parts.installer) },
    { name: 'helper.ps1', text: crlf(parts.helper) },
    { name: 'launch.vbs', text: crlf(parts.vbs) },
  ];
}

// ---- ブラウザがフォルダに書かせてくれないときの、ダウンロード用の zip (圧縮なし) ----

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** ファイルを圧縮なしで zip にする (名前は UTF-8)。ダウンロードした zip を展開すれば、置いた場合と同じ並びになる */
export function zipFiles(files: LinkFile[], now = new Date()): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((Math.max(now.getFullYear(), 1980) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = enc.encode(f.text);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // 必要な版
    lv.setUint16(6, 0x0800, true); // 名前は UTF-8
    lv.setUint16(8, 0, true); // 圧縮なし
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + end.length);
  let p = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}
