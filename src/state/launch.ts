/**
 * アプリとして入れたこのソフトで、.nmrfig をダブルクリックしたとき (public/manifest.webmanifest の file_handlers)。
 * Windows がこのソフトを開き、ブラウザが launchQueue でファイルを渡してくる。開いている窓があればそこに渡す
 * (launch_handler の focus-existing)。.jdf は Delta で開くので、ここには来ない
 */
import { tr } from '../i18n';
import { openFiles } from './fileOps';
import { notify, type FileHandle } from './store';

type LaunchWindow = Window & {
  launchQueue?: { setConsumer(consumer: (params: { files?: readonly FileHandle[] }) => void | Promise<void>): void };
};

/** 渡されたファイルを開く (前回の作業を読み込んだあとに呼ぶ。先に開くと前回の図で上書きされてしまう) */
export function startFileLaunch() {
  const queue = (window as LaunchWindow).launchQueue;
  if (!queue) return;
  queue.setConsumer(async (params) => {
    if (!params.files?.length) return;
    try {
      const files = await Promise.all(params.files.map(async (handle) => ({ file: await handle.getFile(), handle })));
      await openFiles(files, 'new');
    } catch (e) {
      notify(tr('ファイルを開けませんでした: {message}', { message: (e as Error).message }), 'error');
    }
  });
}
