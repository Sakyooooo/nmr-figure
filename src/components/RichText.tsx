import type { SVGProps } from 'react';
import { parseRich } from '../lib/richText';

type SvgTextProps = Omit<SVGProps<SVGTextElement>, 'fontSize'> & { text: string; fontSize: number };

/**
 * ^{..} / _{..} を上付き・下付きにして描く SVG テキスト。
 * dy で上下させると PowerPoint の「図形に変換」で崩れるので、baseline-shift (割合) を使う。
 * この書き方だと PowerPoint でも本物の上付き・下付き書式になる。
 */
export function RichSvgText({ text, fontSize, ...rest }: SvgTextProps) {
  return (
    <text fontSize={fontSize} {...rest}>
      {parseRich(text).map((seg, i) => {
        if (seg.kind === 'sup' || seg.kind === 'sub')
          return (
            <tspan key={i} baselineShift={seg.kind === 'sup' ? '33%' : '-20%'} fontSize="70%">
              {seg.text}
            </tspan>
          );
        if (seg.kind === 'italic')
          return (
            <tspan key={i} fontStyle="italic">
              {seg.text}
            </tspan>
          );
        if (seg.kind === 'bold')
          return (
            <tspan key={i} fontWeight="bold">
              {seg.text}
            </tspan>
          );
        return <tspan key={i}>{seg.text}</tspan>;
      })}
    </text>
  );
}

/** パネル表示用 */
export function RichHtml({ text }: { text: string }) {
  return (
    <>
      {parseRich(text).map((seg, i) =>
        seg.kind === 'sup' ? (
          <sup key={i}>{seg.text}</sup>
        ) : seg.kind === 'sub' ? (
          <sub key={i}>{seg.text}</sub>
        ) : seg.kind === 'italic' ? (
          <i key={i}>{seg.text}</i>
        ) : seg.kind === 'bold' ? (
          <b key={i}>{seg.text}</b>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}
