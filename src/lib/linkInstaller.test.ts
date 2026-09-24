import { describe, expect, it } from 'vitest';
import { buildLinkInstaller } from './linkInstaller';

const fromB64 = (s: string) => new TextDecoder('utf-8', { ignoreBOM: true }).decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));

describe('ChemDraw 連携を入れるファイル', () => {
  const installer = '﻿# 入れる\r\nWrite-Output "連携"\r\n';
  const helper = '﻿# helper 日本語\r\n';
  const vbs = "' launch\r\n";
  const cmd = buildLinkInstaller({ installer, helper, vbs });

  it('cmd が読み違えないように ASCII だけ・CRLF', () => {
    expect(/^[\x00-\x7f]*$/.test(cmd)).toBe(true);
    expect(cmd.startsWith('@echo off\r\n')).toBe(true);
    expect(cmd.includes('\n') && !/[^\r]\n/.test(cmd)).toBe(true);
  });

  it('最後の印のあとに、中身 (helper・launch.vbs と installer) が入っている', () => {
    const payload = cmd.slice(cmd.lastIndexOf('::NMRFIG::') + '::NMRFIG::'.length).replace(/\s+/g, '');
    const body = fromB64(payload);
    const helperB64 = /\$NmrfigHelper='([^']+)'/.exec(body)![1];
    const vbsB64 = /\$NmrfigVbs='([^']+)'/.exec(body)![1];
    // helper は BOM ごと (日本語のコメントを Windows PowerShell が読めるように)
    expect(fromB64(helperB64)).toBe(helper);
    expect(fromB64(vbsB64)).toBe(vbs);
    // installer は iex で動かすので BOM を外す
    expect(body.endsWith(installer.slice(1))).toBe(true);
    expect(body.includes('﻿#')).toBe(false);
  });

  it('起動の行は自分の場所を渡し、最後の印から読む', () => {
    const line = cmd.split('\r\n')[2];
    expect(line).toContain("$NmrfigSelf='%~f0'");
    expect(line).toContain("LastIndexOf('::NMRFIG::')");
    expect(cmd.split('\r\n')[3]).toBe('exit /b');
  });
});

describe('改行', () => {
  it('LF の中身も CRLF にして入れる', () => {
    const cmd = buildLinkInstaller({ installer: 'a\nb\n', helper: 'h\n', vbs: 'v\n' });
    const body = new TextDecoder().decode(Uint8Array.from(atob(cmd.slice(cmd.lastIndexOf('::NMRFIG::') + 10).replace(/\s+/g, '')), (c) => c.charCodeAt(0)));
    expect(body.endsWith('a\r\nb\r\n')).toBe(true);
    expect(atob(/\$NmrfigVbs='([^']+)'/.exec(body)![1])).toBe('v\r\n');
  });
});
