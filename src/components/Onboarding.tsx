/**
 * 初めて開いたときの使い方の説明 (5 枚)。閉じると settings.ui.onboardingDone を覚えて、次からは出さない。
 * ホーム画面の「使い方」・設定・操作を探す (Ctrl+K) から、いつでも見直せる。
 * 1 枚目で言語 (日本語 / English) を選べる (英語を使う人が最初に見る画面なので)。
 * 書くのは本当にある操作だけ (以前、見本に無い操作を描いてしまったことがある)。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { tr, trk, useLang } from '../i18n';
import { setLanguage, setOnboardingDone, useEditor } from '../state/store';

export const useOnboarding = create<{ open: boolean }>(() => ({ open: false }));

export function openOnboarding() {
  useOnboarding.setState({ open: true });
}

const STEPS: { title: string; text: string; art: () => ReactNode }[] = [
  {
    title: trk('NMR Figure Editor へようこそ'),
    text: trk('JEOL Delta のスペクトル (.jdf) から、Word・PowerPoint に貼るきれいな図を作ります。データは外に送らず、このパソコンの中だけで扱います。'),
    art: ArtWelcome,
  },
  {
    title: trk('データフォルダを選ぶ'),
    text: trk('ホーム画面で「データフォルダを選ぶ」を押し、.jdf の入ったフォルダを選びます。測定日・サンプルごとに並び、ダブルクリックで開きます。チェックを付けてまとめて開くと、重ね書きになります。'),
    art: ArtFolder,
  },
  {
    title: trk('図を作る'),
    text: trk('下の道具で、ピーク値・積分・図形・文字を付けます。右のパネルで、不純物の候補や図に入れるもの・大きさを決めます。操作が見つからないときは Ctrl+K で名前から探せます。'),
    art: ArtEdit,
  },
  {
    title: trk('Delta と行き来する'),
    text: trk('ピーク値と積分は、開いた .jdf と自動で同期します (Delta で保存した中身もこちらに入ります)。保存すると図の入った .jdf になり、ダブルクリックすると Delta でも開けます。'),
    art: ArtDelta,
  },
  {
    title: trk('Word・PowerPoint に貼る'),
    text: trk('「図をコピー」を押して貼り付けます。ベクターの図なので、拡大しても荒くなりません。PowerPoint では「図形に変換」すると、文字や線を直せます。'),
    art: ArtPaste,
  },
];

export function Onboarding() {
  const open = useOnboarding((s) => s.open);
  return open ? <OnboardingDialog /> : null;
}

function OnboardingDialog() {
  const [step, setStep] = useState(0);
  const ref = useRef<HTMLDialogElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal();
    // showModal は最初のボタン (言語) に入るので、「次へ」に移す
    nextRef.current?.focus();
  }, []);
  const close = () => {
    setOnboardingDone(true);
    useOnboarding.setState({ open: false });
  };
  const last = step === STEPS.length - 1;
  const next = () => (last ? close() : setStep(step + 1));
  const back = () => setStep(Math.max(0, step - 1));
  const s = STEPS[step];
  const Art = s.art;
  return (
    <dialog
      ref={ref}
      className="modal onboarding"
      aria-labelledby="onboarding-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onKeyDown={(e) => {
        if (e.target instanceof HTMLSelectElement) return;
        if (e.key === 'ArrowRight') next();
        else if (e.key === 'ArrowLeft') back();
      }}
    >
      <div className="onboarding-art" aria-hidden="true">
        <Art />
      </div>
      <div className="onboarding-body">
        <p className="onboarding-count">{tr('{n} / {total}', { n: step + 1, total: STEPS.length })}</p>
        <h2 id="onboarding-title">{tr(s.title)}</h2>
        <p>{tr(s.text)}</p>
        {step === 0 && <LanguageChoice />}
      </div>
      <footer className="onboarding-foot">
        {!last && (
          <button type="button" className="btn ghost" onClick={close}>
            {tr('スキップ')}
          </button>
        )}
        <div className="onboarding-dots" role="tablist" aria-label={tr('説明のページ')}>
          {STEPS.map((x, i) => (
            <button
              key={x.title}
              type="button"
              role="tab"
              aria-selected={i === step}
              aria-label={tr('{n} 枚目: {title}', { n: i + 1, title: tr(x.title) })}
              className={i === step ? 'on' : ''}
              onClick={() => setStep(i)}
            />
          ))}
        </div>
        <div className="spacer" />
        {step > 0 && (
          <button type="button" className="btn" onClick={back}>
            {tr('戻る')}
          </button>
        )}
        <button type="button" className="btn primary" onClick={next} ref={nextRef}>
          {last ? tr('はじめる') : tr('次へ')}
        </button>
      </footer>
    </dialog>
  );
}

/** 言語を選ぶ (説明の 1 枚目)。どちらの言語でも読めるように、名前はそれぞれの言葉で出す */
function LanguageChoice() {
  const lang = useLang((s) => s.lang);
  const setting = useEditor((s) => s.settings.ui.lang);
  return (
    <div className="onboarding-lang">
      <span className="muted">Language / 言語</span>
      <div className="segmented" role="group" aria-label="Language / 言語">
        <button type="button" className={lang === 'ja' ? 'on' : ''} aria-pressed={lang === 'ja'} onClick={() => setLanguage('ja')}>
          日本語
        </button>
        <button type="button" className={lang === 'en' ? 'on' : ''} aria-pressed={lang === 'en'} onClick={() => setLanguage('en')}>
          English
        </button>
      </div>
      {setting === 'auto' && <span className="muted">{tr('(ブラウザの言語に合わせています)')}</span>}
    </div>
  );
}

// ---------------------------------------------------------------- 絵 (色はデザイントークン)

const W = 480;
const H = 168;

function Frame({ children }: { children: ReactNode }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="onboarding-svg">
      {children}
    </svg>
  );
}

/** 小さなスペクトル (x, y が左下、幅 w・高さ h) */
function Spectrum({ x, y, w, h, color = 'var(--data-spectrum-1)' }: { x: number; y: number; w: number; h: number; color?: string }) {
  const p = (fx: number, fy: number) => `${x + fx * w},${y - fy * h}`;
  const d = `M${p(0, 0)} L${p(0.18, 0)} L${p(0.22, 0.55)} L${p(0.26, 0)} L${p(0.5, 0)} L${p(0.53, 0.95)} L${p(0.56, 0)} L${p(0.6, 0.35)} L${p(0.63, 0)} L${p(1, 0)}`;
  return (
    <>
      <line x1={x} y1={y + 3} x2={x + w} y2={y + 3} className="art-axis" />
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </>
  );
}

function Arrow({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  return <path d={`M${x1} ${y} H${x2} M${x2 - 7} ${y - 6} L${x2} ${y} L${x2 - 7} ${y + 6}`} className="art-arrow" />;
}

function ArtWelcome() {
  return (
    <Frame>
      <rect x={40} y={30} width={170} height={110} rx={10} className="art-card" />
      <Spectrum x={58} y={118} w={134} h={70} />
      <text x={125} y={24} className="art-label" textAnchor="middle">
        .jdf
      </text>
      <Arrow x1={222} x2={262} y={85} />
      <rect x={278} y={20} width={120} height={138} rx={6} className="art-page" />
      <Spectrum x={292} y={82} w={92} h={40} />
      {[98, 110, 122, 134].map((yy, i) => (
        <line key={yy} x1={292} y1={yy} x2={i === 3 ? 350 : 384} y2={yy} className="art-textline" />
      ))}
    </Frame>
  );
}

function ArtFolder() {
  return (
    <Frame>
      <path d="M40 58 h44 l10 12 h70 a8 8 0 0 1 8 8 v58 a8 8 0 0 1 -8 8 h-124 a8 8 0 0 1 -8 -8 v-70 a8 8 0 0 1 8 -8 z" className="art-folder" />
      <Arrow x1={190} x2={228} y={100} />
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(246 ${24 + i * 44})`}>
          <rect width={200} height={36} rx={8} className="art-card" />
          <rect x={10} y={11} width={14} height={14} rx={3} className={i === 1 ? 'art-check on' : 'art-check'} />
          <rect x={34} y={10} width={50} height={16} rx={8} className="art-chip" />
          <rect x={92} y={10} width={50} height={16} rx={8} className="art-chip" />
          <line x1={150} y1={18} x2={188} y2={18} className="art-textline" />
        </g>
      ))}
    </Frame>
  );
}

function ArtEdit() {
  return (
    <Frame>
      <rect x={30} y={14} width={300} height={140} rx={10} className="art-card" />
      <Spectrum x={50} y={104} w={260} h={70} />
      <text x={188} y={28} className="art-label" textAnchor="middle">
        7.26
      </text>
      <line x1={188} y1={32} x2={188} y2={40} className="art-axis" />
      <path d="M100 118 v6 h40 v-6" className="art-integral" />
      <text x={120} y={138} className="art-label" textAnchor="middle">
        1.00
      </text>
      <rect x={112} y={140} width={136} height={24} rx={12} className="art-dock" />
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={i} cx={130 + i * 25} cy={152} r={6} className={i === 1 ? 'art-tool on' : 'art-tool'} />
      ))}
      <rect x={346} y={14} width={110} height={140} rx={10} className="art-card" />
      {[34, 54, 74, 94, 114].map((yy, i) => (
        <line key={yy} x1={360} y1={yy} x2={i % 2 ? 420 : 442} y2={yy} className="art-textline" />
      ))}
    </Frame>
  );
}

function ArtDelta() {
  return (
    <Frame>
      <rect x={30} y={34} width={150} height={100} rx={10} className="art-card" />
      <text x={105} y={56} className="art-label" textAnchor="middle">
        NMR Figure Editor
      </text>
      <Spectrum x={48} y={118} w={114} h={44} />
      <rect x={300} y={34} width={150} height={100} rx={10} className="art-card" />
      <text x={375} y={56} className="art-label" textAnchor="middle">
        Delta
      </text>
      <Spectrum x={318} y={118} w={114} h={44} color="var(--data-spectrum-2)" />
      <path d="M190 74 H290 M283 68 L290 74 L283 80" className="art-arrow" />
      <path d="M290 98 H190 M197 92 L190 98 L197 104" className="art-arrow" />
      <rect x={220} y={112} width={40} height={48} rx={4} className="art-page" />
      <text x={240} y={141} className="art-label" textAnchor="middle">
        .jdf
      </text>
    </Frame>
  );
}

function ArtPaste() {
  return (
    <Frame>
      <rect x={52} y={36} width={90} height={112} rx={8} className="art-card" />
      <rect x={78} y={28} width={38} height={16} rx={4} className="art-chip" />
      <Spectrum x={66} y={112} w={62} h={40} />
      <Arrow x1={160} x2={204} y={92} />
      <rect x={222} y={14} width={210} height={146} rx={6} className="art-page" />
      <Spectrum x={242} y={100} w={170} h={62} />
      {[118, 130, 142].map((yy, i) => (
        <line key={yy} x1={242} y1={yy} x2={i === 2 ? 350 : 412} y2={yy} className="art-textline" />
      ))}
    </Frame>
  );
}
