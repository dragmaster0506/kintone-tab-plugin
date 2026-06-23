/**
 * タブ表示プラグイン desktop.js（A案：全フィールド常時表示＋スクロールジャンプ）
 *
 * 【やること】
 *  - 設定で選んだラベルを「タブ」にする
 *  - タブを押すと、そのラベルの位置へスクロールして移動する（中身は隠さない）
 *  - スクロールでタブバーが画面外に出たら、画面上部48pxに固定タブバーを出す
 *  - いま見えている位置のタブを自動でハイライトする
 *  - PC：タブは横並び（多ければ折り返し）／モバイル：横一列で横スクロール
 *
 * 【重要な前提（前セッションで判明した事実）】
 *  - ラベルには HTMLの id属性が付かない → getElementById では掴めない
 *  - そのため「ラベルのテキスト」で照合してDOM要素を探す
 *  - ラベルのテキストはHTMLタグを含むことがあるので、タグを除去して比較する
 *  - モバイルは window.scrollTo が効かない → 専用のmainコンテナを動かす
 */
((PLUGIN_ID) => {
  'use strict';

  const FIXED_TOP = 48;            // 固定タブバーの上部位置(px)
  const ACTIVE_BG = '#3498db';     // 選択中タブの背景
  const ACTIVE_COLOR = '#ffffff';
  const NORMAL_BG = '#ffffff';
  const NORMAL_COLOR = '#333333';
  const NORMAL_BORDER = '#c8d0d8';

  const MOBILE_SCROLL_SEL =
    '#main > div > div > div.gaia-mobile-v2-viewpanel-viewpanelcontainer > div > main';

  // ------------------------------------------------------------
  // 設定の読み込み
  // ------------------------------------------------------------
  const config = kintone.plugin.app.getConfig(PLUGIN_ID);
  if (!config) return;

  const tabSpaceId = config.tabSpaceId || 'tab_space';
  const useAllTab = (config.showAllTab !== 'false');
  const allTabName = config.allTabName || 'すべて';
  const useKeyboard = (config.keyboardShortcut !== 'false');

  let tabs = [];
  try {
    tabs = JSON.parse(config.tabs || '[]');
    if (!Array.isArray(tabs)) tabs = [];
  } catch (e) {
    tabs = [];
  }
  if (!tabs.length) return;

  // ====== ユーティリティ ======

  // HTMLタグを除去して見える文字だけにする
  function stripTags(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html || '';
    return (tmp.textContent || tmp.innerText || '');
  }

  // 比較用の正規化（タグ除去・空白除去・小文字化）
  const normalize = (s) => stripTags(s).trim().replace(/\s+/g, '').toLowerCase();

  // 設定のタブはタグが残っている可能性があるので、表示用テキストを整えておく
  tabs = tabs.map((t) => ({
    elementId: t.elementId || '',
    text: stripTags(t.text).trim()
  }));

  function getScrollContainer() {
    return document.querySelector(MOBILE_SCROLL_SEL) || document.scrollingElement || document.documentElement;
  }

  const isPageScroll = (c) => (c === document.scrollingElement || c === document.documentElement);

  // ====== ラベル要素をテキストで探す ======
  function findLabelElement(labelText) {
    const target = normalize(labelText);
    const candidates = document.querySelectorAll('.control-value-label-gaia');
    for (const el of candidates) {
      if (normalize(el.innerText) === target) {
        return el.closest('.row-gaia') || el.closest('.control-label-field-gaia') || el;
      }
    }
    return null;
  }

  // ====== スクロール ======
  function scrollToLabel(labelText) {
    const anchor = findLabelElement(labelText);
    if (!anchor) return;

    const container = getScrollContainer();
    const fixedBar = document.getElementById('ktab-fixed-bar');
    const fixedShown = fixedBar && fixedBar.dataset.state === 'shown';
    const fixedHeight = fixedShown ? fixedBar.offsetHeight : 0;
    const offset = FIXED_TOP + fixedHeight;

    if (isPageScroll(container)) {
      const top = anchor.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top: top, behavior: 'smooth' });
    } else {
      const top =
        anchor.getBoundingClientRect().top -
        container.getBoundingClientRect().top +
        container.scrollTop -
        offset;
      container.scrollTo({ top: top, behavior: 'smooth' });
    }
  }

  function scrollToTop() {
    const container = getScrollContainer();
    if (isPageScroll(container)) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // ====== タブボタン生成 ======
  function createTabButton(tab, isAllTab) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ktab-button';
    btn.textContent = tab.text;          // textContent なのでタグは入らない
    btn.dataset.text = tab.text || '';
    btn.dataset.isAll = isAllTab ? 'true' : 'false';

    Object.assign(btn.style, {
      height: '34px',
      padding: '0 14px',
      borderRadius: '8px',
      margin: '0 4px',
      whiteSpace: 'nowrap',     // 文字を折り返さない（横スクロール前提）
      flex: '0 0 auto',         // 縮まない・伸びない（横スクロールできるように）
      border: '1px solid ' + NORMAL_BORDER,
      background: NORMAL_BG,
      color: NORMAL_COLOR,
      cursor: 'pointer',
      fontSize: '14px'
    });

    btn.addEventListener('click', () => {
      if (isAllTab) {
        scrollToTop();
      } else {
        scrollToLabel(tab.text);
      }
      highlightByText(isAllTab ? allTabName : tab.text);
    });

    return btn;
  }

  // ====== ハイライト ======
  function highlightByText(labelText) {
    const target = normalize(labelText);
    document.querySelectorAll('.ktab-button').forEach((b) => {
      const on = normalize(b.dataset.text) === target;
      b.style.background = on ? ACTIVE_BG : NORMAL_BG;
      b.style.color = on ? ACTIVE_COLOR : NORMAL_COLOR;
      b.style.borderColor = on ? ACTIVE_BG : NORMAL_BORDER;
    });
  }

  // ====== タブバーの中身（横スクロールする内側コンテナ）を作る ======
  function buildBarInner() {
    const inner = document.createElement('div');
    inner.className = 'ktab-inner';
    Object.assign(inner.style, {
      display: 'flex',
      flexWrap: 'nowrap',         // 横一列
      overflowX: 'auto',          // はみ出たら横スクロール
      overflowY: 'hidden',
      width: '100%',
      boxSizing: 'border-box',
      padding: '4px 0',
      WebkitOverflowScrolling: 'touch'
    });

    if (useAllTab) {
      inner.appendChild(createTabButton({ text: allTabName }, true));
    }
    tabs.forEach((t) => inner.appendChild(createTabButton(t, false)));
    return inner;
  }

  // ====== スペース要素を取得 ======
  function getTabSpaceElement() {
    if (kintone.app && kintone.app.record && kintone.app.record.getSpaceElement) {
      const el = kintone.app.record.getSpaceElement(tabSpaceId);
      if (el) return el;
    }
    if (kintone.mobile && kintone.mobile.app && kintone.mobile.app.record &&
        kintone.mobile.app.record.getSpaceElement) {
      const el = kintone.mobile.app.record.getSpaceElement(tabSpaceId);
      if (el) return el;
    }
    return document.getElementById('user-js-' + tabSpaceId);
  }

  // ====== 固定タブバー（上部48px） ======
  function ensureFixedBar() {
    if (document.getElementById('ktab-fixed-bar')) return;

    const bar = document.createElement('div');
    bar.id = 'ktab-fixed-bar';
    Object.assign(bar.style, {
      position: 'fixed',
      top: FIXED_TOP + 'px',
      left: '0',
      right: '0',
      zIndex: '1000',
      background: '#ffffff',
      boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
      boxSizing: 'border-box',
      padding: '0 8px',
      transform: 'translateY(-150%)',
      transition: 'transform 180ms ease-out',
      pointerEvents: 'none'
    });
    bar.dataset.state = 'hidden';
    bar.appendChild(buildBarInner());
    document.body.appendChild(bar);
  }

  function setFixedBarState(show) {
    const bar = document.getElementById('ktab-fixed-bar');
    if (!bar) return;
    bar.style.transform = show ? 'translateY(0)' : 'translateY(-150%)';
    bar.style.pointerEvents = show ? 'auto' : 'none';
    bar.dataset.state = show ? 'shown' : 'hidden';
  }

  // ====== いま見えているラベルを判定してハイライト ======
  function updateActiveByScroll() {
    const container = getScrollContainer();
    const baseTop = isPageScroll(container) ? 0 : container.getBoundingClientRect().top;
    const lineY = baseTop + FIXED_TOP + 10;

    let current = null;
    for (const t of tabs) {
      const el = findLabelElement(t.text);
      if (!el) continue;
      if (el.getBoundingClientRect().top - 1 <= lineY) {
        current = t.text;
      }
    }
    if (current) {
      highlightByText(current);
    } else if (useAllTab) {
      highlightByText(allTabName);
    }
  }

  // ====== スクロール監視 ======
  function setupScrollWatch(spaceEl) {
    const container = getScrollContainer();

    const getSpaceBottom = () => {
      const rect = spaceEl.getBoundingClientRect();
      if (isPageScroll(container)) return rect.bottom + window.pageYOffset;
      return rect.bottom - container.getBoundingClientRect().top + container.scrollTop;
    };

    const onScroll = () => {
      const y = isPageScroll(container) ? window.pageYOffset : container.scrollTop;
      const spaceBottom = getSpaceBottom();
      if (y > spaceBottom - FIXED_TOP) {
        setFixedBarState(true);
      } else {
        setFixedBarState(false);
      }
      updateActiveByScroll();
    };

    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    if (container && container.addEventListener) {
      container.addEventListener('scroll', onScroll, { passive: true });
    }
    setTimeout(onScroll, 150);
  }

  // ====== キーボード操作（Ctrl + ← / →） ======
  function setupKeyboard() {
    if (!useKeyboard) return;
    document.addEventListener('keydown', (e) => {
      if (!e.ctrlKey) return;
      const ae = document.activeElement;
      const tag = (ae && ae.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (ae && ae.isContentEditable)) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();

      const texts = tabs.map((t) => t.text);
      const active = document.querySelector('.ktab-button[data-active="1"]');
      let idx = active ? texts.indexOf(active.dataset.text) : 0;
      if (idx === -1) idx = 0;
      idx = e.key === 'ArrowRight' ? Math.min(idx + 1, texts.length - 1) : Math.max(idx - 1, 0);
      scrollToLabel(texts[idx]);
      highlightByText(texts[idx]);
    });
  }

  // ====== メインのセットアップ ======
  function setup() {
    const spaceEl = getTabSpaceElement();

    let baseHost = spaceEl;
    if (!baseHost && kintone.app && kintone.app.record && kintone.app.record.getHeaderMenuSpaceElement) {
      baseHost = kintone.app.record.getHeaderMenuSpaceElement();
    }
    if (!baseHost) return;

    if (!baseHost.querySelector('.ktab-button')) {
      baseHost.classList.add('ktab-base-bar');
      Object.assign(baseHost.style, {
        width: '100%',
        boxSizing: 'border-box'
      });
      baseHost.appendChild(buildBarInner());
    }

    ensureFixedBar();
    setupScrollWatch(spaceEl || baseHost);
    setupKeyboard();
  }

  function teardown() {
    const bar = document.getElementById('ktab-fixed-bar');
    if (bar) bar.remove();
  }

  // ====== kintoneイベント ======
  const showEvents = [
    'app.record.detail.show',
    'app.record.create.show',
    'app.record.edit.show',
    'mobile.app.record.detail.show',
    'mobile.app.record.create.show',
    'mobile.app.record.edit.show'
  ];

  kintone.events.on(showEvents, (event) => {
    setTimeout(setup, 200);
    return event;
  });

  kintone.events.on(['app.record.index.show', 'mobile.app.record.index.show'], (event) => {
    teardown();
    return event;
  });

  window.addEventListener('hashchange', teardown);

})(window.__TAB_PLUGIN_ID__ || (typeof kintone !== 'undefined' && kintone.$PLUGIN_ID));
