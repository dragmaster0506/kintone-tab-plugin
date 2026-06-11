/**
 * タブ表示プラグイン 設定画面
 *
 * フォームレイアウトを自動取得し、要素ID付きラベルの一覧を表示。
 * チェックされたラベルの要素IDを「タブの境目」として保存する。
 * 設定値はすべて文字列で保存される（境目はカンマ区切り、ON/OFFは 'true'/'false'）
 */
(function (PLUGIN_ID) {
  'use strict';

  // 設定画面の入力欄
  const labelListEl = document.getElementById('label-list');
  const tabSpaceIdInput = document.getElementById('tab-space-id');
  const showAllTabCheck = document.getElementById('show-all-tab');
  const allTabNameInput = document.getElementById('all-tab-name');
  const keyboardCheck = document.getElementById('keyboard-shortcut');

  // ------------------------------------------------------------
  // 保存済みの設定を読み込んで画面に反映（未設定なら初期値）
  // ------------------------------------------------------------
  const config = kintone.plugin.app.getConfig(PLUGIN_ID);

  // 保存済みの境目ラベル（要素IDのカンマ区切り文字列 → 配列に）
  const savedTabIds = (config.tabLabelIds || '').split(',').filter(Boolean);

  tabSpaceIdInput.value = config.tabSpaceId || 'tab_space';
  allTabNameInput.value = config.allTabName || 'すべて';
  showAllTabCheck.checked = (config.showAllTab !== 'false'); // 未設定はON
  keyboardCheck.checked = (config.keyboardShortcut !== 'false'); // 未設定はON

  // ------------------------------------------------------------
  // ラベルのHTML装飾を取り除いてただの文字にする
  // ------------------------------------------------------------
  function toPlainText(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return (doc.body.textContent || '').trim();
  }

  // ------------------------------------------------------------
  // フォーム内のラベル一覧を取得してチェックボックスで表示する
  // ※設定画面はアプリ管理者が開くため、フォーム編集中の最新状態
  //   （プレビュー環境）を取得する。アプリ更新前のラベルも選択できる
  // ------------------------------------------------------------
  async function loadLabelList() {
    const response = await kintone.api(
      kintone.api.url('/k/v1/preview/app/form/layout', true),
      'GET',
      { app: kintone.app.getId() }
    );

    const labels = []; // { elementId, text } の一覧（フォームの上から順）
    let noIdCount = 0; // 要素IDが無いラベルの数（注意喚起用）

    response.layout.forEach(function (row) {
      if (row.type !== 'ROW') return; // グループ・テーブル内のラベルは対象外
      row.fields.forEach(function (field) {
        if (field.type !== 'LABEL') return;
        if (field.elementId) {
          labels.push({
            elementId: field.elementId,
            text: toPlainText(field.label) || '(文字なし)',
          });
        } else {
          noIdCount++;
        }
      });
    });

    // 一覧を描画
    labelListEl.textContent = ''; // 「読み込み中...」を消す

    if (labels.length === 0) {
      const p = document.createElement('p');
      p.className = 'ktab-config__note';
      p.textContent = '要素ID付きのラベルが見つかりません。フォーム編集でラベルを配置し、要素IDを設定してからこの画面を開き直してください。';
      labelListEl.appendChild(p);
    }

    labels.forEach(function (item) {
      const row = document.createElement('label');
      row.className = 'ktab-config__list-item';

      const check = document.createElement('input');
      check.type = 'checkbox';
      check.value = item.elementId;
      check.className = 'ktab-label-check';
      // 保存済みの設定にあればチェック状態で表示
      check.checked = (savedTabIds.indexOf(item.elementId) !== -1);

      const text = document.createElement('span');
      text.textContent = item.text;

      const idBadge = document.createElement('span');
      idBadge.className = 'ktab-config__list-id';
      idBadge.textContent = item.elementId;

      row.appendChild(check);
      row.appendChild(text);
      row.appendChild(idBadge);
      labelListEl.appendChild(row);
    });

    // 要素IDの無いラベルがあれば知らせる（常時表示になるため）
    if (noIdCount > 0) {
      const p = document.createElement('p');
      p.className = 'ktab-config__note';
      p.textContent = '※ 要素IDが未設定のラベルが ' + noIdCount + ' 個あります。これらは表示制御できないため、全タブで常に表示されます。';
      labelListEl.appendChild(p);
    }
  }

  loadLabelList().catch(function (e) {
    labelListEl.textContent = '';
    const p = document.createElement('p');
    p.className = 'ktab-config__note';
    p.textContent = 'ラベル一覧の取得に失敗しました: ' + e.message;
    labelListEl.appendChild(p);
  });

  // ------------------------------------------------------------
  // 保存ボタン
  // ------------------------------------------------------------
  document.getElementById('ktab-save').addEventListener('click', function () {
    const tabSpaceId = tabSpaceIdInput.value.trim();
    const allTabName = allTabNameInput.value.trim();

    // チェックされたラベルの要素IDを集める（フォームの上から順のまま）
    const checkedIds = [];
    labelListEl.querySelectorAll('.ktab-label-check').forEach(function (check) {
      if (check.checked) checkedIds.push(check.value);
    });

    // 入力チェック
    if (checkedIds.length === 0) {
      if (!confirm('タブの境目が1つも選ばれていません。このままだとタブは表示されません（プラグインは何もしません）。保存しますか？')) {
        return;
      }
    }
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

    // 保存（配列はカンマ区切り文字列に、チェックは 'true'/'false' にして保存）
    kintone.plugin.app.setConfig(
      {
        tabLabelIds: checkedIds.join(','),
        tabSpaceId: tabSpaceId,
        showAllTab: String(showAllTabCheck.checked),
        allTabName: allTabName || 'すべて',
        keyboardShortcut: String(keyboardCheck.checked),
      },
      function () {
        alert('設定を保存しました。アプリの更新ボタンを押して反映してください。');
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
