/**
 * タブ表示プラグイン【A案・追従スクロール版／診断版】
 *
 * ■ この診断版の目的
 *   モバイルで表示されない原因を、画面の一番上に出るメッセージで確認する。
 *   コンソールが見られないモバイルでも、何が起きているか目で分かるようにする。
 *
 * ■ 確認できること
 *   ・イベントが発火したか／モバイル判定が正しいか
 *   ・境目ラベルの「定義」がいくつ見つかったか（設定の読み込み）
 *   ・境目ラベルの「DOM要素」がいくつ見つかったか（ここが0だと表示されない）
 *   ・見つからなかった要素IDはどれか
 *   ・タブバーの設置先スペースが見つかったか
 *
 * ■ 使い方
 *   GitHub の desktop.js をこの中身に差し替えてモバイルで開く。
 *   画面上部に出る黄色いメッセージ欄を読んで、報告してください。
 *   原因が分かったら、診断メッセージを消した正式版に直します。
 */
(function (PLUGIN_ID) {
  'use strict';

  const rawConfig = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
  const CONFIG = {
    tabSpaceId: rawConfig.tabSpaceId || 'tab_space',
    tabLabelIds: (rawConfig.tabLabelIds || '').split(',').filter(Boolean),
    keyboardShortcut: rawConfig.keyboardShortcut !== 'false',
  };

  const TAB_BAR_ID = 'ktab-bar';
  const STYLE_ID = 'ktab-style';
  const DEBUG_ID = 'ktab-debug';

  const FIXED_TOP_PC = 48;
  const FIXED_TOP_MOBILE = 48;
  const SCROLL_MARGIN = 60;

  const state = {
    bar: null,
    placeholder: null,
    isMobile: false,
    tabs: [],
    activeIndex: 0,
  };

  // ============================================================
  // ▼▼▼ 診断メッセージを画面に出す（この版だけの機能）▼▼▼
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
        'padding: 8px 12px; font-size: 13px; line-height: 1.6;',
        'font-family: sans-serif; white-space: pre-wrap;',
        'max-height: 50vh; overflow-y: auto;',
      ].join('');
      // 閉じるボタン
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

  function onScroll() {
    updateFixed();
    updateActiveTab();
  }

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

  function updateActiveTab() {
    const tabs = state.tabs;
    if (!tabs.length) return;
    const topOffset = state.isMobile ? FIXED_TOP_MOBILE : FIXED_TOP_PC;
    const line = topOffset + SCROLL_MARGIN;
    let current = 0;
    for (let i = 0; i < tabs.length; i++) {
      const el = tabs[i].anchorEl;
      if (!el || !document.body.contains(el)) continue;
      const top = el.getBoundingClientRect().top;
      if (top - line <= 1) {
        current = i;
      } else {
        break;
      }
    }
    if (current !== state.activeIndex) {
      state.activeIndex = current;
      updateTabStyles(current);
    }
  }

  function attachScrollListeners() {
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', onScroll, { passive: true });
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
  }
  attachScrollListeners();

  function jumpToTab(index) {
    const tab = state.tabs[index];
    if (!tab || !tab.anchorEl || !document.body.contains(tab.anchorEl)) return;
    const topOffset = state.isMobile ? FIXED_TOP_MOBILE : FIXED_TOP_PC;
    const rectTop = tab.anchorEl.getBoundingClientRect().top;
    const currentScroll = window.pageYOffset || document.documentElement.scrollTop || 0;
    const targetY = rectTop + currentScroll - topOffset - SCROLL_MARGIN;
    window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
    state.activeIndex = index;
    updateTabStyles(index);
  }

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

  function findAnchorElement(elementId) {
    let el = document.getElementById(elementId);
    if (el) return el;
    el = document.querySelector('[data-id="' + elementId + '"]');
    return el || null;
  }

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

  function buildTabs(defs) {
    const tabs = [];
    const notFound = []; // ▼ 診断用：見つからなかった要素ID
    defs.forEach(function (def) {
      const anchorEl = findAnchorElement(def.labelId);
      if (!anchorEl) {
        notFound.push(def.labelId);
        return;
      }
      tabs.push({ name: def.name, labelId: def.labelId, anchorEl: anchorEl });
    });
    // ▼ 診断：見つからなかったIDを報告
    if (notFound.length > 0) {
      debugLog('④ DOM要素が見つからないラベルID: ' + notFound.join(', '));
    }
    return tabs;
  }

  function updateTabStyles(activeIndex) {
    if (!state.bar) return;
    state.bar.querySelectorAll('.ktab-btn').forEach(function (btn, index) {
      btn.classList.toggle('ktab-btn--active', index === activeIndex);
    });
  }

  function createTabBar(isMobile, tabs) {
    injectStyle();
    const oldBar = document.getElementById(TAB_BAR_ID);
    if (oldBar) oldBar.remove();
    const oldPh = document.getElementById(TAB_BAR_ID + '-ph');
    if (oldPh) oldPh.remove();

    let space = isMobile
      ? kintone.mobile.app.record.getSpaceElement(CONFIG.tabSpaceId)
      : kintone.app.record.getSpaceElement(CONFIG.tabSpaceId);

    let usedFallback = false; // ▼ 診断用
    if (!space) {
      usedFallback = true;
      space = isMobile
        ? kintone.mobile.app.getHeaderSpaceElement()
        : kintone.app.record.getHeaderMenuSpaceElement();
    }

    // ▼ 診断：設置先スペースの状況を報告
    if (!space) {
      debugLog('⑤ タブバーの設置先スペースが見つかりません（スペースID「' +
        CONFIG.tabSpaceId + '」もヘッダーもNG）→ ここで表示できず終了');
      return;
    }
    debugLog('⑤ 設置先スペース: ' +
      (usedFallback ? 'ヘッダーにフォールバック設置' : 'スペースID「' + CONFIG.tabSpaceId + '」に設置'));

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

    debugLog('⑥ タブバー設置完了！ タブ数: ' + tabs.length);
  }

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

    // ▼ 診断：ここまで来たか／モバイル判定／設定の中身
    debugLog('── 診断開始 ──');
    debugLog('① イベント発火: ' + event.type + '（モバイル判定: ' + isMobile + '）');
    debugLog('② 設定のラベルID一覧: ' +
      (CONFIG.tabLabelIds.length ? CONFIG.tabLabelIds.join(', ') : '（空＝未設定）') +
      ' / スペースID: ' + CONFIG.tabSpaceId);

    try {
      const layout = await getLayout(isMobile);
      const defs = collectTabDefs(layout);
      debugLog('③ レイアウトから見つけた境目ラベル定義の数: ' + defs.length);

      if (defs.length === 0) {
        debugLog('→ 境目ラベル定義が0件のため終了（設定 or レイアウトを確認）');
        return event;
      }

      const tabs = buildTabs(defs);
      if (tabs.length === 0) {
        debugLog('→ ジャンプ先のDOM要素が1つも見つからず終了（モバイルで要素ID取得に失敗の可能性大）');
        return event;
      }

      createTabBar(isMobile, tabs);

      state.activeIndex = 0;
      updateTabStyles(0);
      onScroll();

    } catch (e) {
      debugLog('✕ エラー発生: ' + e.message);
    }

    return event;
  });

})(window.__TAB_PLUGIN_ID__ || kintone.$PLUGIN_ID);
