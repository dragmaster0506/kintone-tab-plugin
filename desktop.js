/**
 * タブ表示プラグイン【モバイルDOM構造 調査版】
 *
 * ■ 目的
 *   モバイルで「境目ラベル」が画面上でどんなHTMLになっているかを調べる。
 *   要素IDが id 属性に付かないモバイルで、代わりに何を手がかりにできるかを探す。
 *
 * ■ 調べること
 *   ・タブ名（ラベルのテキスト）を含む要素が画面上にあるか
 *   ・その要素の tagName・class・各種属性（data-id など）
 *   ・要素ID／data-id／テキスト一致 のどれで取得できるか
 *
 * ■ 使い方
 *   GitHub の desktop.js をこの中身に差し替えてモバイルで開く。
 *   画面上部の黄色い欄に出る内容を、そのまま教えてください（写真でもOK）。
 */
(function (PLUGIN_ID) {
  'use strict';

  const rawConfig = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
  const CONFIG = {
    tabLabelIds: (rawConfig.tabLabelIds || '').split(',').filter(Boolean),
  };

  const DEBUG_ID = 'ktab-debug';

  // ============================================================
  // 診断メッセージを画面に出す
  // ============================================================
  function debugLog(text) {
    let box = document.getElementById(DEBUG_ID);
    if (!box) {
      box = document.createElement('div');
      box.id = DEBUG_ID;
      box.style.cssText = [
        'position: fixed; top: 0; left: 0; right: 0; z-index: 99999;',
        'background: #fff3cd; color: #664d03;',
        'border-bottom: 2px solid #ffc107;',
        'padding: 8px 12px; font-size: 12px; line-height: 1.5;',
        'font-family: sans-serif; white-space: pre-wrap;',
        'max-height: 70vh; overflow-y: auto;',
      ].join('');
      const close = document.createElement('button');
      close.textContent = '✕ 閉じる';
      close.style.cssText = 'float:right; margin-left:8px; padding:2px 8px; cursor:pointer;';
      close.addEventListener('click', function () { box.remove(); });
      box.appendChild(close);
      document.body.appendChild(box);
    }
    const line = document.createElement('div');
    line.textContent = text;
    box.appendChild(line);
  }

  function getAppId(isMobile) {
    return isMobile ? kintone.mobile.app.getId() : kintone.app.getId();
  }

  async function getLayout(isMobile) {
    const response = await kintone.api(
      kintone.api.url('/k/v1/app/form/layout', true),
      'GET',
      { app: getAppId(isMobile) }
    );
    return response.layout;
  }

  function toPlainText(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return (doc.body.textContent || '').trim();
  }

  // ▼ 設定された境目ラベルの「要素ID・テキスト」を集める
  function collectLabelItems(layout) {
    const items = [];
    layout.forEach(function (row) {
      if (row.type !== 'ROW') return;
      row.fields.forEach(function (field) {
        if (field.type === 'LABEL' && field.elementId &&
            CONFIG.tabLabelIds.indexOf(field.elementId) !== -1) {
          items.push({
            id: field.elementId,
            text: toPlainText(field.label),
          });
        }
      });
    });
    return items;
  }

  // ▼ あるテキストを「ちょうど持っている」一番内側の要素を画面から探す
  //   （子に同じテキストが無い、できるだけ内側の要素を選ぶ）
  function findElementByText(text) {
    if (!text) return null;
    const all = document.querySelectorAll('div, span, p, label, strong, b, h3, h4');
    let best = null;
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      const t = (el.textContent || '').trim();
      if (t === text) {
        best = el; // 後に出てくる（より内側の）要素で上書きしていく
      }
    }
    return best;
  }

  // ▼ 要素の特徴（タグ・id・class・data-*属性）を文字にする
  function describe(el) {
    if (!el) return '（見つからず）';
    const attrs = [];
    if (el.id) attrs.push('id="' + el.id + '"');
    if (el.className && typeof el.className === 'string') {
      attrs.push('class="' + el.className + '"');
    }
    if (el.attributes) {
      for (let i = 0; i < el.attributes.length; i++) {
        const a = el.attributes[i];
        if (a.name.indexOf('data-') === 0) {
          attrs.push(a.name + '="' + a.value + '"');
        }
      }
    }
    return '<' + el.tagName.toLowerCase() + '> ' + attrs.join(' ');
  }

  const events = [
    'mobile.app.record.detail.show',
    'mobile.app.record.create.show',
    'mobile.app.record.edit.show',
    'app.record.detail.show',
    'app.record.create.show',
    'app.record.edit.show',
  ];

  kintone.events.on(events, async function (event) {
    const isMobile = (event.type.indexOf('mobile.') === 0);

    debugLog('── DOM調査開始 ──');
    debugLog('イベント: ' + event.type + '（モバイル: ' + isMobile + '）');

    try {
      const layout = await getLayout(isMobile);
      const items = collectLabelItems(layout);
      debugLog('境目ラベル数: ' + items.length);

      items.forEach(function (item, i) {
        debugLog('━━━━━━━━━━');
        debugLog('[' + (i + 1) + '] タブ名「' + item.text + '」 要素ID=' + item.id);

        // ① 要素IDで探せるか
        const byId = document.getElementById(item.id);
        debugLog('  ・getElementById: ' +
          (byId ? '取得OK → ' + describe(byId) : '取得できず'));

        // ② data-id で探せるか
        const byData = document.querySelector('[data-id="' + item.id + '"]');
        debugLog('  ・[data-id]: ' +
          (byData ? '取得OK → ' + describe(byData) : '取得できず'));

        // ③ テキストで探せるか（これが本命の手がかり）
        const byText = findElementByText(item.text);
        debugLog('  ・テキスト一致: ' +
          (byText ? '取得OK → ' + describe(byText) : '取得できず'));

        // ④ テキスト一致した要素の親もヒントになるので見る
        if (byText && byText.parentElement) {
          debugLog('    └ 親: ' + describe(byText.parentElement));
        }
      });

      debugLog('── 調査おわり ──');

    } catch (e) {
      debugLog('✕ エラー: ' + e.message);
    }

    return event;
  });

})(window.__TAB_PLUGIN_ID__ || kintone.$PLUGIN_ID);
