import { memo } from 'react';
import { arrowHead, dashArray, markerPath, type PlacedAnnotation, type Scene } from '../lib/scene';
import { tracePath } from '../lib/tracePath';
import type { FigureImage, FigureStyle } from '../state/types';
import { FigureImages } from './FigureImages';
import { RichSvgText } from './RichText';

const INK = '#000000';

/** 書き出しにもそのまま使う図の本体。操作用の要素はここに入れない */
export const FigureContent = memo(function FigureContent({
  scene,
  figure,
  images = [],
}: {
  scene: Scene;
  figure: FigureStyle;
  images?: FigureImage[];
}) {
  const { layout } = scene;
  const { plot } = layout;
  const bottom = plot.y + plot.h;
  return (
    <g fontFamily={figure.fontFamily} pointerEvents="none">
      <FigureImages images={images} figure={layout} />
      {figure.showBorder && (
        <rect x={0.5} y={0.5} width={layout.width - 1} height={layout.height - 1} fill="none" stroke={INK} strokeWidth={1} />
      )}
      {layout.layers.map((g) => (
        <path
          key={g.layer.id}
          d={tracePath(g, layout)}
          fill="none"
          stroke={g.layer.color}
          strokeWidth={g.layer.lineWidth}
          strokeLinejoin="round"
        />
      ))}

      {figure.showFrame && <rect x={plot.x} y={plot.y} width={plot.w} height={plot.h} fill="none" stroke={INK} strokeWidth={1} />}
      {!figure.showFrame && <line x1={plot.x} y1={bottom} x2={plot.x + plot.w} y2={bottom} stroke={INK} strokeWidth={1} />}

      {/* x 軸 */}
      <path
        d={
          scene.xTicks.minor.map((x) => `M${x.toFixed(1)} ${bottom}v2.5`).join('') +
          scene.xTicks.major.map((t) => `M${t.px.toFixed(1)} ${bottom}v5`).join('')
        }
        stroke={INK}
        strokeWidth={0.8}
      />
      {scene.xTicks.major.map((t) => (
        <text key={t.label} x={t.px} y={bottom + 6 + figure.tickFontSize} fontSize={figure.tickFontSize} textAnchor="middle" fill={INK}>
          {t.label}
        </text>
      ))}

      {/* y 軸 */}
      {scene.yTicks && (
        <>
          <path d={scene.yTicks.map((t) => `M${plot.x} ${t.py.toFixed(1)}h-5`).join('')} stroke={INK} strokeWidth={0.8} />
          {scene.yTicks.map((t) => (
            <text
              key={t.label}
              transform={`translate(${plot.x - 9} ${t.py.toFixed(1)}) rotate(-90)`}
              fontSize={figure.tickFontSize}
              textAnchor="middle"
              fill={INK}
            >
              {t.label}
            </text>
          ))}
          <text
            transform={`translate(${plot.x - 36} ${plot.y + plot.h - 4}) rotate(-90)`}
            fontSize={figure.tickFontSize - 1}
            textAnchor="start"
            fill={INK}
          >
            abundance
          </text>
        </>
      )}

      {/* ピーク値 */}
      {scene.peakLabels.map((p) => (
        <g key={p.id}>
          <polyline points={p.leader.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} fill="none" stroke={p.color} strokeWidth={0.8} />
          {/* dy を使うと PowerPoint で文字が大きくなるので、中心合わせのずれは translate に入れる */}
          <text
            transform={`translate(${(p.tx + figure.peakLabelFontSize * 0.35).toFixed(1)} ${p.ty.toFixed(1)}) rotate(-90)`}
            fontSize={figure.peakLabelFontSize}
            textAnchor={p.anchor}
            fill={p.color}
          >
            {p.text}
          </text>
        </g>
      ))}

      {/* 積分 */}
      {scene.integrals.map((x) => (
        <g key={x.id}>
          {x.curve && <path d={x.curve} fill="none" stroke={x.color} strokeWidth={1} />}
          {x.bracket?.map((line, i) => (
            <polyline key={i} points={line.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ')} fill="none" stroke={x.color} strokeWidth={0.8} />
          ))}
          <text
            transform={`translate(${(x.tx + figure.integralFontSize * 0.35).toFixed(1)} ${x.ty.toFixed(1)}) rotate(-90)`}
            fontSize={figure.integralFontSize}
            textAnchor={x.anchor}
            fill={x.color}
          >
            {x.text}
          </text>
        </g>
      ))}

      {/* 積み重ねの名前 */}
      {scene.layerLabels.map((l, i) => (
        <RichSvgText key={i} text={l.text} x={l.x} y={l.y} fontSize={figure.layerLabelFontSize} fill={l.color} />
      ))}

      {/* マーカーと凡例 */}
      {scene.markers.map((m) => (
        <path key={m.id} d={markerPath(m.style.shape, m.x, m.y, figure.markerSize)} fill={m.style.color} />
      ))}
      {scene.legend && (
        <g>
          {scene.legend.rows.map((s, i) => {
            const cy = scene.legend!.y + scene.legend!.rowH * (i + 0.5) + 2;
            return (
              <g key={s.id}>
                <path d={markerPath(s.shape, scene.legend!.x + figure.markerSize / 2 + 2, cy, figure.markerSize)} fill={s.color} />
                <RichSvgText
                  text={s.name}
                  x={scene.legend!.x + figure.markerSize + 10}
                  y={cy + figure.legendFontSize * 0.35}
                  fontSize={figure.legendFontSize}
                  fill={INK}
                />
              </g>
            );
          })}
        </g>
      )}

      {scene.annotations.map((pa) => (
        <AnnotationShape key={pa.a.id} pa={pa} />
      ))}

      {figure.showXCaption && (
        <text x={plot.x} y={layout.captionY} fontSize={9} fill={INK}>
          {scene.caption}
        </text>
      )}
      {scene.citations.map((citation, i) => (
        <RichSvgText
          key={citation}
          text={`文献: ${citation}`}
          x={layout.width / 2}
          y={layout.citationY + i * 11}
          fontSize={9}
          textAnchor="middle"
          fill={INK}
        />
      ))}
      {figure.showTitle && scene.title && (
        <RichSvgText text={scene.title} x={layout.width / 2} y={layout.titleY} fontSize={figure.titleFontSize} textAnchor="middle" fill={INK} />
      )}
    </g>
  );
});

export function AnnotationShape({ pa }: { pa: PlacedAnnotation }) {
  const { a, p1, p2 } = pa;
  const common = {
    stroke: a.stroke,
    strokeWidth: a.strokeWidth,
    strokeDasharray: dashArray(a.dash, a.strokeWidth),
    fill: a.fill ?? 'none',
  };
  switch (a.kind) {
    case 'ellipse':
      return (
        <ellipse
          cx={r1((p1.px + p2.px) / 2)}
          cy={r1((p1.py + p2.py) / 2)}
          rx={r1(Math.abs(p2.px - p1.px) / 2)}
          ry={r1(Math.abs(p2.py - p1.py) / 2)}
          {...common}
        />
      );
    case 'rect':
      return (
        <rect
          x={r1(Math.min(p1.px, p2.px))}
          y={r1(Math.min(p1.py, p2.py))}
          width={r1(Math.abs(p2.px - p1.px))}
          height={r1(Math.abs(p2.py - p1.py))}
          {...common}
        />
      );
    case 'line':
      return <line x1={r1(p1.px)} y1={r1(p1.py)} x2={r1(p2.px)} y2={r1(p2.py)} {...common} fill="none" strokeLinecap="round" />;
    case 'arrow': {
      // 線は矢じりの手前で止める (太い線で先端がつぶれないように)
      const len = Math.hypot(p2.px - p1.px, p2.py - p1.py) || 1;
      const cut = Math.min(len, 4 + a.strokeWidth * 2);
      const ex = p2.px - ((p2.px - p1.px) / len) * cut;
      const ey = p2.py - ((p2.py - p1.py) / len) * cut;
      return (
        <g>
          <line x1={r1(p1.px)} y1={r1(p1.py)} x2={r1(ex)} y2={r1(ey)} {...common} fill="none" />
          <polygon points={arrowHead(p1.px, p1.py, p2.px, p2.py, a.strokeWidth)} fill={a.stroke} stroke="none" />
        </g>
      );
    }
    case 'text':
      return (
        <g>
          {a.text.split('\n').map((line, i) => (
            <RichSvgText key={i} text={line} x={r1(p1.px)} y={r1(p1.py + i * a.fontSize * 1.25)} fontSize={a.fontSize} fill={a.stroke} />
          ))}
        </g>
      );
  }
}

function r1(v: number) {
  return Math.round(v * 10) / 10;
}
