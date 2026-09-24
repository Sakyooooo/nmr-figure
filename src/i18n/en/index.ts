/** 英語の辞書 (鍵 = 画面の日本語の文)。場所ごとのファイルをまとめる */
import { EN_EDITOR } from './editor';
import { EN_HOME } from './home';
import { EN_MESSAGES } from './messages';
import { EN_PANELS1 } from './panels1';
import { EN_PANELS2 } from './panels2';

export const EN: Record<string, string> = { ...EN_HOME, ...EN_EDITOR, ...EN_PANELS1, ...EN_PANELS2, ...EN_MESSAGES };
