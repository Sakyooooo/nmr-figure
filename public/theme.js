// 画面の色を、画面を描く前に決める (ダークモードで開いたとき一瞬白くならないように)。
// 決め方は src/lib/theme.ts と同じ。設定は lib/settings.ts と同じ場所 (localStorage) から読む
(function () {
  var theme = 'system';
  try {
    var saved = JSON.parse(localStorage.getItem('nmr-figure-editor.settings.v1') || '{}');
    if (saved && saved.ui && saved.ui.theme) theme = saved.ui.theme;
  } catch (e) {
    // 読めないときは OS に合わせる
  }
  if (theme !== 'light' && theme !== 'dark') theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
})();
