/**
 * ChemDraw 連携を入れるファイル (ChemDraw連携を入れる.cmd) を作る。
 * 1 つのファイルに installer.ps1・helper.ps1・launch.vbs を入れる (base64)。ダブルクリックすると cmd が PowerShell を起動し、
 * 自分の後ろに入れた中身を取り出して実行する。cmd は BOM や日本語で読み違えるので、ファイルは ASCII だけにする
 */
export const LINK_INSTALLER_NAME = 'ChemDraw連携を入れる.cmd';

/** 中身の始まりの印 (起動の行にも同じ文字があるので、最後の印から読む) */
const MARK = '::NMRFIG::';

function base64Utf8(text: string) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** 改行を Windows の形 (CRLF) にそろえる (公開版は Linux でビルドするので LF になっている) */
const crlf = (s: string) => s.replace(/\r?\n/g, '\r\n');

export function buildLinkInstaller(parts: { installer: string; helper: string; vbs: string }): string {
  const body = `$NmrfigHelper='${base64Utf8(crlf(parts.helper))}'\r\n$NmrfigVbs='${base64Utf8(crlf(parts.vbs))}'\r\n${crlf(parts.installer.replace(/^﻿/, ''))}`;
  const payload = base64Utf8(body).match(/.{1,100}/g) ?? [];
  return [
    '@echo off',
    'rem NMR Figure Editor - ChemDraw link installer (double-click to install)',
    `powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -Command "$NmrfigSelf='%~f0'; $t=[IO.File]::ReadAllText($NmrfigSelf); $p=$t.Substring($t.LastIndexOf('${MARK}')+${MARK.length}); iex ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p)))"`,
    'exit /b',
    MARK,
    ...payload,
    '',
  ].join('\r\n');
}
