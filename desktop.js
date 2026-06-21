/**
 * タブ表示プラグイン 本体【A案・追従スクロール版（試作）】
 *
 * ■ 絞り込み版との違い
 *   ・フィールドの表示/非表示は一切しない（全フィールドが常に見える）
 *   ・タブをクリックすると、その境目ラベルの位置まで画面をスクロールする
 *   ・スクロールに合わせて「今いる位置のタブ」を自動でハイライトする
 *
 * ■ 仕組み
 *   設定画面でチェックした「要素IDが設定されたラベル」をタブの境目（＝ジャンプ先）にする。
 *   タブ名＝ラベルのテキスト。タブバーは設定したスペースに表示（無ければヘッダー）。
 *
 * ■ 機能
 *   ・スクロール追従（タブバーが画面外に出たら上部に固定表示）
 *   ・キーボードでタブ移動（Ctrl + ←／→。押すとそのタブ位置へジャンプ）
 *   ・モバイルではタブバーを横1段＋横スクロール表示
 *
 * ■ 注意（試作版）
 *   うまく動かない場合は、GitHub の desktop.js を元の絞り込み版に戻せばOK。
 */
(function (PLUGIN_ID) {
  'use strict';

  // ============================================================
  // 設定画面で保存された値を読み込む（絞り込み版と同じ設定をそのまま使う）
  // ============================================================
  const rawConfig = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
  const CONFIG = {
    tabSpaceId: rawConfig.tabSpaceId || 'tab_space', // タブバーを置くスペースの要素ID
    // 設定画面でチェックされた「タブの境目ラベル」の要素ID一覧
    tabLabelIds: (rawConfig.tabLabelIds || '').split(',').filter(Boolean),
    keyboardShortcut: rawConfig.keyboardShortcut !== 'false', // Ctrl+←→を使うか
  };

  const TAB_BAR_ID = 'ktab-bar';
  const STYLE_ID = 'ktab-style';

  // ▼ 固定表示するときの画面上端からの距離（px）
  const FIXED_TOP_PC = 48;
  const FIXED_TOP_MOBILE = 48;

  // ▼ ジャンプ先の位置を、固定タブバーのぶんだけ余分に上に確保する量（px）
  //   これが無いと、ジャンプ先ラベルが固定タブバーの裏に隠れてしまう。
  const SCROLL_MARGIN = 60;

  // 画面上の要素やタブ構成をまとめて記憶しておく場所
  const state = {
    bar: null,
    placeholder: null,
    isMobile: false,
    tabs: [],          // { name, labelId, anchorEl } の配列
    activeIndex: 0,
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
      // ▼ モバイルだけ横1段＋横スクロール
      '#' + TAB_BAR_ID + '.ktab-bar--mobile {',
      '  flex-wrap: nowrap;',
      '  overflow-x: auto;',
      '  -webkit-overflow-scrolling: touch;',
      '}',
      '#' + TAB_BAR_ID + '.ktab-bar--mobile .ktab-btn {',
      '  flex: 0 0 auto;',
      '}',
    ].join('\n');

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ============================================================
  // スクロール処理：①タブバーの固定／解除 ②現在地ハイライト
  //   絞り込み版は①だけだったが、A案では②も同時にやる。
  // ============================================================
  function onScroll() {
    updateFixed();      // ①タブバーを固定するか戻すか
    updateActiveTab();  // ②今いる位置のタブをハイライト
  }

  // ① タブバーの固定／解除
  function updateFixed() {
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

  // ② 現在地ハイライト
  //   各タブの境目ラベルが画面上端からどれくらいの位置にあるかを見て、
  //   「画面上端の判定ライン」を最後に越えたタブを現在地とする。
  function updateActiveTab() {
    const tabs = state.tabs;
    if (!tabs.length) return;

    const topOffset = state.isMobile ? FIXED_TOP_MOBILE : FIXED_TOP_PC;
    const line = topOffset + SCROLL_MARGIN; // 判定ライン

    let current = 0;
    for (let i = 0; i < tabs.length; i++) {
      const el = tabs[i].anchorEl;
      if (!el || !document.body.contains(el)) continue;
      const top = el.getBoundingClientRect().top;
      // ラベルが判定ラインより上（または同じ位置）まで来ていたら、
      // そこまでスクロール済み＝そのタブの領域に入っている
      if (top - line <= 1) {
        current = i;
      } else {
        break; // それより下のタブはまだ到達していない
      }
    }

    if (current !== state.activeIndex) {
      state.activeIndex = current;
      updateTabStyles(current);
    }
  }

  // ▼ スクロールを監視する対象を登録（絞り込み版と同じ・モバイル対策込み）
  function attachScrollListeners() {
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', onScroll, { passive: true });
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
  }
  attachScrollListeners();

  // ============================================================
  // タブをクリック／キー操作したときのジャンプ処理
  // ============================================================
  function jumpToTab(index) {
    const tab = state.tabs[index];
    if (!tab || !tab.anchorEl || !document.body.contains(tab.anchorEl)) return;

    const topOffset = state.isMobile ? FIXED_TOP_MOBILE : FIXED_TOP_PC;

    // ラベルの現在位置（画面上端基準）＋ 今のスクロール量 ＝ ページ全体での絶対位置
    const rectTop = tab.anchorEl.getBoundingClientRect().top;
    const currentScroll = window.pageYOffset || document.documentElement.scrollTop || 0;
    // 固定タブバーのぶんだけ上に余白をとって、ラベルが隠れないようにする
    const targetY = rectTop + currentScroll - topOffset - SCROLL_MARGIN;

    window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });

    // 先に見た目を切り替えておく（スクロール完了後にonScrollでも再調整される）
    state.activeIndex = index;
    updateTabStyles(index);
  }

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
    if (isTypingTarget(e.target)) return;

    const tabs = state.tabs;
    if (!tabs.length || !state.bar || !document.body.contains(state.bar)) return;

    e.preventDefault();
    const direction = (e.key === 'ArrowRight') ? 1 : -1;
    const nextIndex = (state.activeIndex + direction + tabs.length) % tabs.length;
    jumpToTab(nextIndex);
  });

  // ============================================================
  // タブ構成の組み立て
  //   絞り込み版はフォーム「レイアウト情報」から組み立てていたが、
  //   A案はジャンプ先となる「実際のDOM要素」が必要なので、
  //   画面上のラベル要素を要素IDで探して anchorEl として持つ。
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

  // ▼ 要素IDから、画面上の実際のDOM要素を探す
  //   kintoneではラベルの「要素ID」が id 属性になる想定。
  //   取れない場合のフォールバックとして data-id も試す。
  function findAnchorElement(elementId) {
    let el = document.getElementById(elementId);
    if (el) return el;
    el = document.querySelector('[data-id="' + elementId + '"]');
    return el || null;
  }

  // ▼ レイアウト情報から「境目ラベルの要素ID・タブ名」の一覧を作る
  //   （順番を保つためにレイアウトの並び順で集める）
  function collectTabDefs(layout) {
    const defs = [];
    layout.forEach(function (row) {
      if (row.type !== 'ROW') return;
      row.fields.forEach(function (field) {
        if (field.type === 'LABEL' && field.elementId &&
            CONFIG.tabLabelIds.indexOf(field.elementId) !== -1) {
          defs.push({
            name: toPlainText(field.label) || 'タブ' + (defs.length + 1),
            labelId: field.elementId,
          });
        }
      });
    });
    return defs;
  }

  // ▼ 境目ラベルの定義 ＋ 実際のDOM要素 を結びつけてタブを完成させる
  function buildTabs(defs) {
    const tabs = [];
    defs.forEach(function (def) {
      const anchorEl = findAnchorElement(def.labelId);
      if (!anchorEl) {
        // DOM要素が見つからないラベルはジャンプできないのでスキップ
        console.warn('タブのジャンプ先が見つかりません（スキップ）:', def.labelId);
        return;
      }
      tabs.push({
        name: def.name,
        labelId: def.labelId,
        anchorEl: anchorEl,
      });
    });
    return tabs;
  }

  // ============================================================
  // タブの見た目（ハイライト）の更新
  // ============================================================
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
    if (isMobile) bar.classList.add('ktab-bar--mobile');

    tabs.forEach(function (tab, index) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ktab-btn';
      btn.textContent = tab.name;
      btn.addEventListener('click', function () {
        jumpToTab(index);
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
      const defs = collectTabDefs(layout);
      if (defs.length === 0) return event; // 境目ラベルが無いアプリでは何もしない

      const tabs = buildTabs(defs);
      if (tabs.length === 0) {
        console.warn('ジャンプ先のラベル要素が画面上に見つかりませんでした。');
        return event;
      }

      createTabBar(isMobile, tabs);

      // 初期ハイライトを今のスクロール位置に合わせる
      state.activeIndex = 0;
      updateTabStyles(0);
      onScroll();

    } catch (e) {
      console.error('タブ表示プラグイン（追従版）の初期化に失敗しました:', e);
    }

    return event;
  });

})(window.__TAB_PLUGIN_ID__ || kintone.$PLUGIN_ID);
