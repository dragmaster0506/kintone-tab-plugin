/**
 * タブ表示プラグイン 設定画面
 * 設定値はすべて文字列で保存される（ON/OFFは 'true'/'false'）
 */
(function (PLUGIN_ID) {
  'use strict';

  // 設定画面の入力欄
  const tabSpaceIdInput = document.getElementById('tab-space-id');
  const showAllTabCheck = document.getElementById('show-all-tab');
  const allTabNameInput = document.getElementById('all-tab-name');
  const keyboardCheck = document.getElementById('keyboard-shortcut');

  // ------------------------------------------------------------
  // 保存済みの設定を読み込んで画面に反映（未設定なら初期値）
  // ------------------------------------------------------------
  const config = kintone.plugin.app.getConfig(PLUGIN_ID);

  tabSpaceIdInput.value = config.tabSpaceId || 'tab_space';
  allTabNameInput.value = config.allTabName || 'すべて';
  showAllTabCheck.checked = (config.showAllTab !== 'false'); // 未設定はON
  keyboardCheck.checked = (config.keyboardShortcut !== 'false'); // 未設定はON

  // ------------------------------------------------------------
  // 保存ボタン
  // ------------------------------------------------------------
  document.getElementById('ktab-save').addEventListener('click', function () {
    const tabSpaceId = tabSpaceIdInput.value.trim();
    const allTabName = allTabNameInput.value.trim();

    // 入力チェック
    if (!tabSpaceId) {
      alert('「タブバーを表示するスペースの要素ID」を入力してください');
      return;
    }
    if (/\s/.test(tabSpaceId)) {
      alert('要素IDに空白は使えません');
      return;
    }
    if (showAllTabCheck.checked && !allTabName) {
      alert('「すべて表示」タブの名前を入力してください');
      return;
    }

    // 保存（チェックボックスは 'true'/'false' の文字列にして保存）
    kintone.plugin.app.setConfig(
      {
        tabSpaceId: tabSpaceId,
        showAllTab: String(showAllTabCheck.checked),
        allTabName: allTabName || 'すべて',
        keyboardShortcut: String(keyboardCheck.checked),
      },
      function () {
        alert('設定を保存しました。アプリの更新ボタンを押して反映してください。');
        // プラグイン一覧（アプリ設定）へ戻る
        window.location.href = '../../flow?app=' + kintone.app.getId();
      }
    );
  });

  // ------------------------------------------------------------
  // キャンセルボタン（前の画面に戻る）
  // ------------------------------------------------------------
  document.getElementById('ktab-cancel').addEventListener('click', function () {
    history.back();
  });

})(kintone.$PLUGIN_ID);
