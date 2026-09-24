/** ホーム画面・使い方の説明・タッチの説明 */
export const EN_HOME: Record<string, string> = {
  // Home.tsx
  その他: 'Other',
  '初めて開いたときの使い方の説明を、もう一度見る': 'Show the getting-started guide again',
  使い方: 'Guide',
  編集中の図に戻る: 'Back to the figure',
  'このフォルダには .jdf がありません。': 'There are no .jdf files in this folder.',
  '条件に合う実験はありません。': 'No experiments match the filters.',
  '{n} 測定': '{n} {n|measurement|measurements}',
  '読めなかったファイル ({n})': 'Files that could not be read ({n})',
  '読み込み中…': 'Loading…',
  データフォルダを選ぶ: 'Choose data folder',
  データフォルダ: 'Data folder',
  '(今回だけ)': '(this session only)',
  'ブラウザがこのフォルダへのアクセスを拒否した状態で覚えています。押すとフォルダを選び直せます':
    'The browser remembers that access to this folder was denied. Click to choose the folder again',
  ブラウザにフォルダの読み取りを許可してもらいます: 'Ask the browser for permission to read the folder',
  フォルダを選び直す: 'Choose folder again',
  フォルダを読み込む: 'Load folder',
  '読み込み中 {done}/{total}': 'Loading {done}/{total}',
  '読み込み直す (新しく測定したファイル)': 'Reload (pick up new measurements)',
  フォルダを変更: 'Change folder',
  'サンプル名・ファイル名・メモ・タグで検索': 'Search by sample, file name, memo, or tag',
  検索: 'Search',
  すべての溶媒: 'All solvents',
  測定日: 'Measurement date',
  新しい順: 'Newest first',
  古い順: 'Oldest first',
  'Z → A': 'Z → A',
  'A → Z': 'A → Z',
  '編集順 (保存した日時)': 'Last edited (saved time)',
  並び: 'Sort',
  '今は{v0}。押すと{v1}になります': 'Now: {v0}. Click for {v1}',
  '{fileName} は開けません': '{fileName} cannot be opened',
  '{label} を選ぶ (まとめて開く)': 'Select {label} (to open several together)',
  '{label}。Enter で開く': '{label}. Press Enter to open',
  '{fileName}\nクリックで右に内容、ダブルクリック (ダブルタップ) か Enter で開く':
    '{fileName}\nClick to show details on the right; double-click (double-tap) or Enter to open',
  'このソフトで編集して保存した版です。開くと、ピーク値・積分・重ね書きなども含めた図ごと開きます (ほかの版は右の「ファイル」で選べます)':
    'A version edited and saved in this app. Opens the whole figure, including peak labels, integrals, and overlays (choose other versions under "File" on the right)',
  '2D の生データです。開くとこのアプリで 2次元の FT をして、等高線で表示します':
    'Raw 2D data. Opening it runs a 2D FT in this app and shows contours',
  'Delta で処理していない生データです。開くとこのアプリで FT・位相補正します':
    'Raw data not processed in Delta. Opening it runs FT and phase correction in this app',
  編集: 'Edited',
  '{n} 版': '{n} versions',
  '{name}\n{layers} 本を重ねた図 ({formatStamp})': '{name}\nFigure with {layers} {layers|spectrum|spectra} ({formatStamp})',
  '保存した図 {name} を開く': 'Open saved figure {name}',
  図: 'Figure',
  '{n} 本': '{n} spectra',
  '{name} をホーム画面から消す (測定データは消えません)': 'Remove {name} from the home screen (measurement data is kept)',
  'ファイル ({n})': 'File ({n})',
  '(保存 {time})': '(saved {time})',
  'このソフトで編集して保存した版です ({layers} 本を重ねた図)。開くと、ピーク値・積分・図形なども含めた図ごと開きます。':
    'A version edited and saved in this app (figure with {layers} spectra). Opens the whole figure, including peak labels, integrals, and shapes.',
  'このソフトで編集して保存した版です。開くと、ピーク値・積分・図形なども含めた図ごと開きます。':
    'A version edited and saved in this app. Opens the whole figure, including peak labels, integrals, and shapes.',
  ' Delta でもこのファイルを開けます (見えるのは一番下のスペクトル)。': ' Delta can also open this file (it shows the bottom spectrum).',
  '2D の生データです。開くと 2次元の FT (サインベル窓・絶対値) をして、等高線で表示します。':
    'Raw 2D data. Opening it runs a 2D FT (sine-bell window, magnitude) and shows contours.',
  '生データ (FID) です。開くと自動で FT・位相補正・ベースライン補正・溶媒での基準合わせをします。':
    'Raw data (FID). Opening it automatically runs FT, phase correction, baseline correction, and referencing to the solvent.',
  測定: 'Measured',
  周波数: 'Frequency',
  積算: 'Scans',
  温度: 'Temperature',
  この図を開く: 'Open this figure',
  この実験を開く: 'Open this experiment',
  編集中の図に追加: 'Add to current figure',
  'ブラウザの中に残した図の控えを消します (保存したファイルと測定データは消えません)':
    'Removes the copy of the figure kept in this browser (the saved file and measurement data are kept)',
  この版をホーム画面から消す: 'Remove this version from the home screen',
  'このソフトで編集した版 ({layers} 本を重ねた図)': 'Edited in this app ({layers} spectra overlaid)',
  このソフトで編集した版: 'Edited in this app',
  '2D (このアプリで処理)': '2D (processed in this app)',
  'Delta で処理した版 {v0}': 'Processed in Delta {v0}',
  '生データ (FID・このアプリで処理)': 'Raw data (FID, processed in this app)',
  実験を選んでください: 'Choose an experiment',
  'クリックで右に内容を表示、ダブルクリックで開きます。': 'Click to see details here; double-click to open.',
  'チェックを付けて複数まとめて開くと、重ね書き・推移グラフに使えます。': 'Check several and open them together to overlay them or make a trend plot.',
  'サンプルを選ぶと、スキーム画像 (ChemDraw などからコピーして貼り付け)・メモ・タグを付けられます。':
    'Select a sample to add a scheme image (copy from ChemDraw and paste), a memo, and tags.',
  '最初に .jdf が入っているフォルダを選んでください。次からは自動で読み込みます。':
    'First, choose the folder that contains your .jdf files. It will be loaded automatically next time.',
  '最初に .jdf が入っているフォルダを選んでください。このブラウザでは毎回選ぶ必要があります (Chrome / Edge なら覚えておけます)。':
    'First, choose the folder that contains your .jdf files. In this browser you need to choose it every time (Chrome / Edge can remember it).',
  '{n} 件の実験': '{n} {n|experiment|experiments}',
  スキーム: 'Scheme',
  '「描く」か、画像を貼り付け (Ctrl+V)・ドロップ': 'Click "Draw", or paste (Ctrl+V) or drop an image',
  構造式や反応式をこのアプリで描きます: 'Draw structures or reactions in this app',
  描き直す: 'Redraw',
  描く: 'Draw',
  画像を選ぶ: 'Choose image',
  外す: 'Remove',
  'スキームを描く画面を読み込んでいます…': 'Loading the drawing editor…',
  メモ: 'Memo',
  '反応名、ノート番号など': 'Reaction name, notebook number, etc.',
  'タグ (カンマ区切り)': 'Tags (comma-separated)',
  '例: W錯体, 反応追跡': 'e.g. W complex, kinetics',
  'メモ・タグ・スキームは、同じサンプル名の測定すべてに共通です。': 'The memo, tags, and scheme are shared by all measurements with the same sample name.',
  スペクトルのプレビュー: 'Spectrum preview',
  選んだ測定: 'Selected measurements',
  '{n} 件を選択中': '{n} selected',
  新しい図で開く: 'Open as new figure',
  選択を解除: 'Clear selection',
  '{formatDay} 〜 {formatDay2}': '{formatDay} – {formatDay2}',

  // TouchHelp.tsx
  '1 本指でなぞる': 'Drag with one finger',
  '選んだ道具で操作 (積分の範囲・図形・拡大する範囲など)': 'Use the selected tool (integral range, shapes, zoom area, etc.)',
  背景を左右になぞる: 'Drag the background left or right',
  '選択の道具のとき、表示する範囲を動かす (上下になぞると高さ)': 'With the select tool, pans the view (drag up or down for height)',
  拡大する: 'Zoom in',
  '拡大の道具で四角く囲む (縦は四角の上端まで)。全体に戻すのは左下のボタン':
    'Draw a box with the zoom tool (vertically up to the top of the box). The button at the bottom left returns to the full view',
  選んだものの操作: 'Actions for the selection',
  '選んだものの真上に出る帯 (値を変える・消す など)': 'The bar right above the selected item (change the value, delete, etc.)',
  元に戻す: 'Undo',
  下の道具の左のボタン: 'The button at the left of the bottom toolbar',
  タッチでの操作: 'Touch gestures',
  '「操作を探す」の「タッチでの操作」からいつでも見られます': 'You can see this again from "Touch gestures" in Find command',
  わかった: 'Got it',

  // Onboarding.tsx (使い方の説明)
  'NMR Figure Editor へようこそ': 'Welcome to NMR Figure Editor',
  'JEOL Delta のスペクトル (.jdf) から、Word・PowerPoint に貼るきれいな図を作ります。データは外に送らず、このパソコンの中だけで扱います。':
    'Make clean figures for Word and PowerPoint from JEOL Delta spectra (.jdf). Your data never leaves this computer.',
  'ホーム画面で「データフォルダを選ぶ」を押し、.jdf の入ったフォルダを選びます。測定日・サンプルごとに並び、ダブルクリックで開きます。チェックを付けてまとめて開くと、重ね書きになります。':
    'On the home screen, click "Choose data folder" and pick the folder with your .jdf files. They are listed by date and sample; double-click to open. Check several and open them together to overlay them.',
  図を作る: 'Build the figure',
  '下の道具で、ピーク値・積分・図形・文字を付けます。右のパネルで、不純物の候補や図に入れるもの・大きさを決めます。操作が見つからないときは Ctrl+K で名前から探せます。':
    'Use the bottom toolbar to add peak labels, integrals, shapes, and text. The right panel handles impurity candidates, what goes into the figure, and its size. Can’t find something? Press Ctrl+K to search commands by name.',
  'Delta と行き来する': 'Work back and forth with Delta',
  'ピーク値と積分は、開いた .jdf と自動で同期します (Delta で保存した中身もこちらに入ります)。保存すると図の入った .jdf になり、ダブルクリックすると Delta でも開けます。':
    'Peak labels and integrals sync automatically with the open .jdf (changes saved in Delta come back here too). Saving creates a .jdf with the figure inside, which also opens in Delta when double-clicked.',
  'Word・PowerPoint に貼る': 'Paste into Word or PowerPoint',
  '「図をコピー」を押して貼り付けます。ベクターの図なので、拡大しても荒くなりません。PowerPoint では「図形に変換」すると、文字や線を直せます。':
    'Click "Copy figure" and paste. It is a vector graphic, so it stays sharp when enlarged. In PowerPoint, use "Convert to Shape" to edit text and lines.',
  '{n} / {total}': '{n} / {total}',
  スキップ: 'Skip',
  説明のページ: 'Guide pages',
  '{n} 枚目: {title}': 'Page {n}: {title}',
  戻る: 'Back',
  はじめる: 'Get started',
  次へ: 'Next',
  '(ブラウザの言語に合わせています)': '(following the browser language)',

  // library.ts / launch.ts / main.tsx
  'フォルダを開けませんでした: {message}': 'Could not open the folder: {message}',
  'ブラウザがこのフォルダへのアクセスを拒否した状態で覚えています。フォルダを選び直してください':
    'The browser remembers that access to this folder was denied. Please choose the folder again',
  'フォルダの読み取りが許可されませんでした。もう一度「フォルダを読み込む」を押すか、「変更」で選び直してください':
    'Permission to read the folder was not granted. Click "Load folder" again, or choose it again with "Change folder"',
  'フォルダを読めませんでした: {message}': 'Could not read the folder: {message}',
  'ファイルが見つかりません。フォルダを読み直してください': 'File not found. Please reload the folder',
  'ファイルを開けませんでした: {message}': 'Could not open the file: {message}',
  'ブラウザの保存領域を開けずに待っています。ほかのタブでこのソフト (前の版) が開いていたら、そのタブを閉じる (または再読み込みする) と、ここで続きが読み込まれます。':
    'Waiting to open the browser storage. If this app (an older version) is open in another tab, close or reload that tab and loading will continue here.',
  'samples (開発用)': 'samples (development)',
  図がありません: 'There is no figure',
};
