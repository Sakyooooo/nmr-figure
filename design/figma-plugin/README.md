# デザインシステムを Figma に組み立てるプラグイン

`docs/design/01-audit-and-direction.md` で決めた色・文字・余白・部品と、主な画面 (編集画面・ホーム) を Figma のファイルに作ります。Figma の接続機能 (MCP) は無料プランだと月に数回しか使えないため、組み立てはこのプラグインで行います。

## 使い方 (最初の 1 回)

1. **Figma のデスクトップアプリ**で、デザインシステムのファイルを開く
   (<https://www.figma.com/design/etpt2QSWyyCkZk2zvztLIB>)。ブラウザ版では開発用プラグインを読み込めません。
   デスクトップアプリが無ければ <https://www.figma.com/downloads/> から入れて、同じアカウントでログインします。
2. 上のメニュー (Figma のロゴ) → **プラグイン** → **開発** → **マニフェストからプラグインをインポート…**
3. このフォルダの `manifest.json` を選ぶ
4. もう一度 **プラグイン** → **開発** → **NMR Design System Builder** を実行する。小さなパネルが出ます (使い終わったら閉じる)
5. **組み立てる** を押す。1 分ほどで「できました」と出たら完了。**Foundations** のページの右上に組み立ての記録が出ます

2 回目からは 4. と 5. だけです。何度実行しても、前に作ったもの (下の名前のページの中身・変数・スタイル) を消してから作り直します。
無料 (Starter) プランは 1 ファイル 3 ページまでなので、ページは新しく作らず、前に作ったページと空のページを使い回します。**このファイルで手で直した部分も消える**ので、直したいときはプラグイン (`code.js`) の方を直してから実行してください。

## 確認用の画像

パネルの **確認用の画像を保存** を押すと、3 ページを 1 枚につないだ画像 (`nmr-design-review.png`) ができます。
**画像を保存** を押して「ダウンロード」のフォルダに保存すると、Claude がそれを見て確かめます
(無料プランは Figma の接続が月に数回しか使えないため、確認はこの画像で行います)。

## できるもの

| ページ | 中身 |
| --- | --- |
| Foundations | 表紙 (原則とページの案内)・組み立ての記録、色 (UI 用と図の中身用)・文字・余白・角丸・影の見本 |
| Components | アイコン (Lucide + NMR 固有)・Button・IconButton・Input・Select・Checkbox・Tab・Badge・Chip・SectionHeader・ListRow・Banner・Toast・Tooltip・MenuItem、その下に組み合わせの見本 (空の状態・読み込み中・エラー・表・メニュー) |
| Screens | 編集画面 (1440 × 900)・ホーム (1440 × 900) |

変数のコレクション: Primitives (直接は使わない) / Color / Data / Spacing / Radius / Size / Motion。
文字のスタイル: `Type/*`、影: `Elevation/*`・`Focus/Ring`。

## コードとの対応

Figma の変数名の `/` を `-` にしたものが CSS の変数名です。変数の「コード構文 (Web)」にも入れてあります。

| Figma | CSS |
| --- | --- |
| `color/text/secondary` | `var(--color-text-secondary)` |
| `spacing/16` | `var(--spacing-16)` |
| `radius/md` | `var(--radius-md)` |
| `Type/Body` | `--type-body` (14px / 22px) |

## 字体

UI は BIZ UDPゴシック (Windows に入っていて、Figma でも使えます)。無ければ Noto Sans JP。
図の見本は Tinos (Times New Roman と同じ幅)。無ければ Noto Serif。

アイコンは [Lucide](https://lucide.dev) (ISC ライセンス) の形を写したものと、同じ規則 (24 の格子・線の太さ 2・丸い端) で描いた NMR 固有のもの (ピーク・積分・高さ・基準・範囲・マーカー・スペクトル) です。

## 直したとき

`code.js` を直したら、Figma で動かす前に模擬の Figma で空回しして確かめます (Figma は要りません)。

```
node design/figma-plugin/check.cjs - fresh
node design/figma-plugin/check.cjs - leftover
```

`fresh` は新しいファイル、`leftover` は前の版が途中で止まって 3 ページ使い切った状態から、それぞれ 2 回ずつ実行します。
模擬なので、本物の Figma でしか起きない失敗 (配置の細かい決まりなど) は見つけられません。
