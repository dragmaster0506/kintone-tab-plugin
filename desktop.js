/**
 * タブ表示プラグイン 本体（PC・モバイル共通）
 *
 * ■ 仕組み
 *   「要素IDが設定されたラベル」をタブの境目として画面を自動分割。
 *   タブ名＝ラベルのテキスト。最初の境目ラベルより上のフィールドは常に表示。
 *   タブバーは設定画面で指定した要素IDのスペースに表示（無ければヘッダーに表示）。
 *
 * ■ 機能
 *   ・「すべて表示」タブ（設定でON/OFF・名前変更可）
 *   ・スクロール追従（タブバーが画面外に出たら上部に固定表示）
 *   ・キーボードでタブ移動（Ctrl + ←／→。設定でON/OFF可）
 *   ・タブ切り替え時はタブバー位置まで自動で戻す（中身の高さ差によるガタつき防止）
 *   ・モバイルではタブバーを折り返し表示（横スクロールしないので「戻るスワイプ」と干渉しない）
 */
(function (PLUGIN_ID) {
  'use strict';

  // ============================================================
  // 設定画面で保存された値を読み込む（未設定の項目は初期値を使う）
  // ※設定値はすべて文字列で保存されるので、ON/OFFは 'true'/'false' の文字列比較
  // ============================================================
  const rawConfig = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
  const CONFIG = {
    tabSpaceId: rawConfig.tabSpaceId || 'tab_space', // タブバーを置くスペースの要素ID
    // 設定画面でチェックされた「タブの境目ラベル」の要素ID一覧
    // （カンマ区切り文字列で保存されているので配列に変換）
    tabLabelIds: (rawConfig.tabLabelIds || '').split(',').filter(Boolean),
    showAllTab: rawConfig.showAllTab !== 'false',     // 「すべて表示」タブを出すか
    allTabName: rawConfig.allTabName || 'すべて',     // 「すべて表示」タブの名前
    keyboardShortcut: rawConfig.keyboardShortcut !== 'false', // Ctrl+←→を使うか
  };

  const TAB_BAR_ID = 'ktab-bar';
  const STYLE_ID = 'ktab-style';

  // ▼ 固定表示するときの画面上端からの距離（px）
  const FIXED_TOP_PC = 48;
  const FIXED_TOP_MOBILE = 0;

  // 画面遷移（詳細→編集など）しても同じタブを開いたままにするための記憶
  let lastActiveIndex = 0;

  // 画面上の要素やタブ構成をまとめて記憶しておく場所
  const state = {
    bar: null,
    placeholder: null,
    isMobile: false,
    tabs: [],
  };

  // ============================================================
  // デザイン（CSS）を1回だけページに注入する
  // ============================================================
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const css = [
      '#' + TAB_BAR_ID + ' {',
      '  display: flex; align-items: flex-end; gap: 2px; flex-wrap: wrap;',
      '  width: 100%; box-sizing: border-box;',
      '  padding: 8px 8px 0;',
      '  border-bottom: 2px solid #1e73be;',
      '}',
      '.ktab-btn {',
      '  padding: 9px 22px; font-size: 14px;',
      '  color: #767676; background: #eef1f3;',
      '  border: 1px solid #d4d4d4; border-bottom: none;',
      '  border-radius: 6px 6px 0 0;',
      '  cursor: pointer; white-space: nowrap;',
      '}',
      '.ktab-btn:hover { background: #e2e6e9; }',
      '.ktab-btn--active, .ktab-btn--active:hover {',
      '  background: #1e73be; color: #ffffff;',
      '  border-color: #1e73be; font-weight: bold;',
      '}',
      '.ktab-bar--fixed {',
      '  position: fixed; left: 0; right: 0; z-index: 100;',
      '  background: #ffffff;',
      '  box-shadow: 0 2px 5px rgba(0,0,0,0.15);',
      '}',
      // ▼ モバイルは折り返し表示。横スクロールしないので「戻るスワイプ」と干渉しない。
      //   タブ同士の縦の隙間を少し空けて、2段になっても見やすくする。
      '#' + TAB_BAR_ID + '.ktab-bar--mobile {',
      '  row-gap: 4px;',
      '}',
    ].join('\n');

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ============================================================
  // スクロール追従
  // ============================================================
  function onScroll() {
    const bar = state.bar;
    const ph = state.placeholder;
    if (!bar || !ph || !document.body.contains(ph)) return;

    const topOffset = state.isMobile ? FIXED_TOP_MOBILE : FIXED_TOP_PC;
    const phTop = ph.getBoundingClientRect().top;

    if (phTop < topOffset) {
      if (!bar.classList.contains('ktab-bar--fixed')) {
        ph.style.height = bar.offsetHeight + 'px';
        bar.classList.add('ktab-bar--fixed');
        bar.style.top = topOffset + 'px';
      }
    } else {
      if (bar.classList.contains('ktab-bar--fixed')) {
        bar.classList.remove('ktab-bar--fixed');
        bar.style.top = '';
        ph.style.height = '0px';
      }
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  // ============================================================
  // キーボードでタブ移動（Ctrl + ←／→）
  // ============================================================
  function isTypingTarget(el) {
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' ||
      el.isContentEditable === true;
  }

  document.addEventListener('keydown', function (e) {
    if (!CONFIG.keyboardShortcut) return;
    if (!e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (isTypingTarget(e.target)) return; // 文字入力中は邪魔しない

    const tabs = state.tabs;
    if (!tabs.length || !state.bar || !document.body.contains(state.bar)) return;

    e.preventDefault();
    const direction = (e.key === 'ArrowRight') ? 1 : -1;
    const nextIndex = (lastActiveIndex + direction + tabs.length) % tabs.length;
    showTab(state.isMobile, tabs, nextIndex);
  });

  // ============================================================
  // タブ構成の組み立て
  // ============================================================
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

  function buildTabs(layout) {
    const tabs = [];
    let currentTab = null;

    function handleField(field) {
      // 設定画面でチェックされたラベル ＝ 新しいタブの開始
      // チェックされていない要素ID付きラベルは「純粋なラベル」として
      // 下の共通処理に流れ、属するタブと一緒に表示/非表示される
      if (field.type === 'LABEL' && field.elementId &&
          CONFIG.tabLabelIds.indexOf(field.elementId) !== -1) {
        currentTab = {
          name: toPlainText(field.label) || 'タブ' + (tabs.length + 1),
          labelId: field.elementId,
          codes: [],
        };
        tabs.push(currentTab);
        return;
      }
      // タブバー設置用のスペースは切り替え対象から除外
      if (field.type === 'SPACER' && field.elementId === CONFIG.tabSpaceId) {
        return;
      }
      const id = field.code || field.elementId;
      if (id && currentTab) {
        currentTab.codes.push(id);
      }
    }

    layout.forEach(function (row) {
      if (row.type === 'ROW') {
        row.fields.forEach(handleField);
      } else if (row.type === 'GROUP' || row.type === 'SUBTABLE') {
        if (currentTab && row.code) {
          currentTab.codes.push(row.code);
        }
      }
    });

    // 「すべて表示」タブを末尾に追加（設定でONのときだけ）
    if (CONFIG.showAllTab && tabs.length > 0) {
      tabs.push({ isAll: true, name: CONFIG.allTabName });
    }

    return tabs;
  }

  // ============================================================
  // 表示の切り替え
  // ============================================================
  function setFieldShown(isMobile, code, isShown) {
    try {
      if (isMobile) {
        kintone.mobile.app.record.setFieldShown(code, isShown);
      } else {
        kintone.app.record.setFieldShown(code, isShown);
      }
    } catch (e) {
      console.warn('表示切替スキップ:', code, e.message);
    }
  }

  function showTab(isMobile, tabs, activeIndex) {
    const isAllMode = !!tabs[activeIndex].isAll;

    tabs.forEach(function (tab, index) {
      if (tab.isAll) return;

      // 境目ラベル：すべて表示中は「見出し」として出す／通常は隠す
      setFieldShown(isMobile, tab.labelId, isAllMode);

      const isShown = isAllMode || (index === activeIndex);
      tab.codes.forEach(function (code) {
        setFieldShown(isMobile, code, isShown);
      });
    });

    lastActiveIndex = activeIndex;
    updateTabStyles(activeIndex);

    // ▼ タブ切り替え後はタブバーの位置まで戻す
    //   長いタブで下まで見た後に短いタブへ切り替えると、ページが急に縮んで
    //   スクロール位置が下基準に押し戻され、タブバーが下がって見える現象を防ぐ。
    //   behavior:'auto'（瞬間移動）にして、切り替えのたびにスーッと動かないようにする。
    if (state.bar) {
      state.bar.scrollIntoView({ block: 'start', behavior: 'auto' });
    }
  }

  function updateTabStyles(activeIndex) {
    if (!state.bar) return;
    state.bar.querySelectorAll('.ktab-btn').forEach(function (btn, index) {
      btn.classList.toggle('ktab-btn--active', index === activeIndex);
    });
  }

  // ============================================================
  // タブバーの作成と設置
  // ============================================================
  function createTabBar(isMobile, tabs) {
    injectStyle();

    const oldBar = document.getElementById(TAB_BAR_ID);
    if (oldBar) oldBar.remove();
    const oldPh = document.getElementById(TAB_BAR_ID + '-ph');
    if (oldPh) oldPh.remove();

    // 設置先：設定した要素IDのスペースを最優先で探す
    let space = isMobile
      ? kintone.mobile.app.record.getSpaceElement(CONFIG.tabSpaceId)
      : kintone.app.record.getSpaceElement(CONFIG.tabSpaceId);

    // スペースが無いアプリではヘッダー部分に表示（フォールバック）
    if (!space) {
      space = isMobile
        ? kintone.mobile.app.getHeaderSpaceElement()
        : kintone.app.record.getHeaderMenuSpaceElement();
    }
    if (!space) return;

    space.style.width = '100%';

    const placeholder = document.createElement('div');
    placeholder.id = TAB_BAR_ID + '-ph';
    placeholder.style.height = '0px';

    const bar = document.createElement('div');
    bar.id = TAB_BAR_ID;
    if (isMobile) bar.classList.add('ktab-bar--mobile'); // モバイルは折り返し表示

    tabs.forEach(function (tab, index) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ktab-btn';
      btn.textContent = tab.name;
      btn.addEventListener('click', function () {
        showTab(isMobile, tabs, index);
      });
      bar.appendChild(btn);
    });

    space.appendChild(placeholder);
    space.appendChild(bar);

    state.bar = bar;
    state.placeholder = placeholder;
    state.isMobile = isMobile;
    state.tabs = tabs;
  }

  // ============================================================
  // イベント登録（詳細・新規作成・編集 × PC・モバイル）
  // ============================================================
  const events = [
    'app.record.detail.show',
    'app.record.create.show',
    'app.record.edit.show',
    'mobile.app.record.detail.show',
    'mobile.app.record.create.show',
    'mobile.app.record.edit.show',
  ];

  kintone.events.on(events, async function (event) {
    const isMobile = (event.type.indexOf('mobile.') === 0);

    try {
      const layout = await getLayout(isMobile);
      const tabs = buildTabs(layout);
      if (tabs.length === 0) return event; // 境目ラベルが無いアプリでは何もしない

      createTabBar(isMobile, tabs);

      const startIndex = (lastActiveIndex < tabs.length) ? lastActiveIndex : 0;
      showTab(isMobile, tabs, startIndex);

    } catch (e) {
      console.error('タブ表示プラグインの初期化に失敗しました:', e);
    }

    return event;
  });

})(window.__TAB_PLUGIN_ID__ || kintone.$PLUGIN_ID);
