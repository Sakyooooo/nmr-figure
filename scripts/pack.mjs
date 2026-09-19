// 配布用のフォルダと zip を作る。
//   npm run pack  →  release/NMR図編集ソフト/ と release/NMR図編集ソフト.zip
// 中身: app/(ビルド済み) + 起動.bat + serve.ps1 + はじめにお読みください.txt
// 相手の PC に Node もインストールも要らない (Windows の PowerShell だけで動く)。
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

function removeTree(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) removeTree(p);
    else unlinkSync(p);
  }
  rmdirSync(dir);
}

/** cpSync({recursive}) も日本語パスで落ちるので、1ファイルずつ写す */
function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const a = join(from, entry.name);
    const b = join(to, entry.name);
    if (entry.isDirectory()) copyTree(a, b);
    else copyFileSync(a, b);
  }
}

const root = process.cwd();
const dist = join(root, 'dist');
const name = 'NMR図編集ソフト';
const out = join(root, 'release', name);

if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist がありません。先に npm run build を実行してください。');
  process.exit(1);
}

// rmSync({recursive}) は日本語を含むパスで落ちる (clean-dist.mjs と同じ理由)
removeTree(join(root, 'release'));
mkdirSync(out, { recursive: true });
copyTree(dist, join(out, 'app'));
copyFileSync(join(root, 'scripts', 'serve.ps1'), join(out, 'serve.ps1'));

// 起動用のバッチ。Windows の日本語コンソールに合わせて CP932 で書く
const bat = [
  '@echo off',
  'chcp 932 > nul',
  'title NMR図編集ソフト',
  'powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"',
  'pause',
].join('\r\n');
// 日本語コンソールで文字化けしないよう CP932 (ASCII の範囲なので latin1 で足りる)
writeFileSync(join(out, '起動.bat'), bat, 'latin1');

const readme = [
  'NMR図編集ソフト',
  '',
  '【使い方】',
  '  1. このフォルダごと、好きな場所 (デスクトップなど) にコピーします。',
  '  2. 「起動.bat」をダブルクリックします。',
  '  3. 黒い画面が出て、既定のブラウザでソフトが開きます。',
  '  4. 終わるときは、ブラウザを閉じてから黒い画面も閉じてください。',
  '',
  '【インストールは要りません】',
  '  Windows に最初から入っている PowerShell だけで動きます。',
  '  インターネットにつながっていなくても使えます。',
  '',
  '【データについて】',
  '  測定データも図も、あなたの PC の中だけで扱われます。外には一切送られません。',
  '  図は自動で保存され、次に開いたとき続きから使えます。',
  '  人に渡すときは「別名で保存」で .nmrfig ファイルにしてください。',
  '',
  '【うまく動かないとき】',
  '  ・ブラウザが開かない → 黒い画面に出ている http://localhost:4173/ を自分で開いてください。',
  '  ・「実行できません」と出る → ファイルの右クリック →「プロパティ」→「許可する」を確認してください。',
  '  ・Chrome か Edge をお使いください (Firefox ではフォルダを開く機能が使えません)。',
].join('\r\n');
writeFileSync(join(out, 'はじめにお読みください.txt'), readme, 'utf8');

// zip にまとめる (Windows 標準の Compress-Archive)
const zip = join(root, 'release', `${name}.zip`);
execFileSync('powershell', [
  '-NoProfile',
  '-Command',
  `Compress-Archive -Path '${out.replace(/'/g, "''")}' -DestinationPath '${zip.replace(/'/g, "''")}' -Force`,
]);
console.log(`できました: release\\${name}.zip`);
