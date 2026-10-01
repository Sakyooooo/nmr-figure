import { describe, expect, it } from 'vitest';
import { buildLinkFiles, crc32, LINK_FILE_NAMES, LINK_INSTALLER_NAME, linkInstallerCmd, zipFiles } from './linkInstaller';

const installer = '﻿# 入れる\nWrite-Output "連携"\n';
const helper = '﻿# helper 日本語\r\n';
const vbs = "' launch\n";

describe('ChemDraw 連携を入れるファイル', () => {
  const files = buildLinkFiles({ installer, helper, vbs });
  const cmd = linkInstallerCmd();

  it('cmd は ASCII だけ・CRLF で、隣の installer.ps1 を -File で動かすだけ', () => {
    expect(/^[\x00-\x7f]*$/.test(cmd)).toBe(true);
    expect(cmd.startsWith('@echo off\r\n')).toBe(true);
    expect(/[^\r]\n/.test(cmd)).toBe(false);
    expect(cmd).toContain('-File "%~dp0installer.ps1"');
  });

  it('本体を隠して動かさない (base64・iex を使わない。ウイルス対策ソフトに削除されたため)', () => {
    for (const f of files) {
      expect(f.text).not.toMatch(/\biex\b|Invoke-Expression|FromBase64String|::NMRFIG::/i);
    }
  });

  it('台本は中身をそのまま置く (ps1 は BOM 付き、改行は CRLF)', () => {
    expect(files.map((f) => f.name)).toEqual(LINK_FILE_NAMES);
    expect(files[0].name).toBe(LINK_INSTALLER_NAME);
    const byName = Object.fromEntries(files.map((f) => [f.name, f.text]));
    expect(byName['installer.ps1']).toBe('﻿# 入れる\r\nWrite-Output "連携"\r\n');
    expect(byName['helper.ps1']).toBe(helper);
    expect(byName['launch.vbs']).toBe("' launch\r\n");
  });
});

describe('ダウンロード用の zip', () => {
  it('CRC-32 (よく使われる確かめの値)', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('全部のファイルが圧縮なしで入り、名前は UTF-8', () => {
    const files = buildLinkFiles({ installer, helper, vbs });
    const zip = zipFiles(files, new Date(2026, 9, 1, 12, 0, 0));
    const view = new DataView(zip.buffer);
    // 終わりの記録: ファイルの数と、中央の目録の位置
    const end = zip.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(files.length);
    let p = view.getUint32(end + 16, true);
    const dec = new TextDecoder();
    for (const f of files) {
      expect(view.getUint32(p, true)).toBe(0x02014b50);
      expect(view.getUint16(p + 8, true) & 0x0800).toBe(0x0800);
      const nameLen = view.getUint16(p + 28, true);
      expect(dec.decode(zip.subarray(p + 46, p + 46 + nameLen))).toBe(f.name);
      // 中身は目録の位置から読める
      const local = view.getUint32(p + 42, true);
      expect(view.getUint32(local, true)).toBe(0x04034b50);
      const size = view.getUint32(local + 18, true);
      const start = local + 30 + view.getUint16(local + 26, true);
      const data = zip.subarray(start, start + size);
      expect(dec.decode(data)).toBe(f.text.replace(/^﻿/, ''));
      expect(crc32(data)).toBe(view.getUint32(local + 14, true));
      p += 46 + nameLen;
    }
  });
});
