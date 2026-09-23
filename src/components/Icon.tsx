import { ICON_PATHS, type IconName } from './iconPaths';

export type { IconName };

/** Figma の部品と同じ形のアイコン (線の色は文字の色に従う) */
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon-svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      // 形は決まった文字列 (iconPaths.ts) だけ
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
    />
  );
}
