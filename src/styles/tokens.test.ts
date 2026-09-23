import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Figma (design/figma-plugin/code.js) とコード (tokens.css) のトークンが 1:1 か
const generator = '../../design/tokens.mjs';

describe('デザイントークン', () => {
  it('tokens.css が Figma の定義から作ったものと同じ (違えば npm run tokens)', async () => {
    const { buildTokensCss, TOKENS_CSS } = (await import(/* @vite-ignore */ generator)) as { buildTokensCss: () => string; TOKENS_CSS: string };
    expect(readFileSync(TOKENS_CSS, 'utf8')).toBe(buildTokensCss());
  });

  it('アイコンの形が Figma の部品と同じ (違えば npm run tokens)', async () => {
    const { buildIconsTs, ICONS_TS } = (await import(/* @vite-ignore */ generator)) as { buildIconsTs: () => string; ICONS_TS: string };
    expect(readFileSync(ICONS_TS, 'utf8')).toBe(buildIconsTs());
  });
});
