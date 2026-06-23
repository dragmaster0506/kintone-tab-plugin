/**
 * タブ表示プラグイン desktop.js（A案：全フィールド常時表示＋スクロールジャンプ）
 *
 * 【やること】
 *  - 設定で選んだラベルを「タブ」にする
 *  - タブを押すと、そのラベルの位置へスクロールして移動する（中身は隠さない）
 *  - スクロールでタブバーが画面外に出たら、画面上部48pxに固定タブバーを出す
 *  - いま見えている位置のタブを自動でハイライトする
 *
 * 【設定値（config）】
 *  - tabSpaceId       … タブバーを置くスペースの要素ID
 *  - tabs             … [{elementId, text}, ...] を JSON文字列にしたもの
 *  - showAllTab       … 「すべて表示」タブを使うか ('true'/'false')
 *  - allTabName       … 「すべて表示」タブの名前
 *  - keyboardShortcut … Ctrl+←/→ でタブ移動するか ('true'/'false')
 *
 * 【重要な前提（前セッションで判明した事実）】
 *  - ラベルには HTMLの id属性が付かない → getElementById では掴めない
 *  - そのため「ラベルのテキスト」で照合してDOM要素を探す
 *  - モバイルは window.scrollTo が効かない → 専用のmainコンテナを動かす
 */
((PLUGIN_ID) => {
  'use strict';

  // ====== 固定タブバーの位置（画面上部からの距離） ======
  const FIXED_TOP = 48; // px（PC・モバイル共通）

  // ====== 選択中タブの背景色 ======
  const ACTIVE_BG = '#3498db';
  const ACTIVE_COLOR = '#ffffff';

  // ====== モバイルのスクロール領域セレクタ（動作中コードより） ======
  const MOBILE_SCROLL_SEL =
    '#main > div > div > div.gaia-mobile-v2-viewpanel-viewpanelcontainer > div > main';

  // ------------------------------------------------------------
  // 設定を読み込む
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
  if (!tabs.length) return; // タブが無ければ何もしない

  // ====== ユーティリティ ======

  // 文字列を比較用に正規化（空白除去・小文字化）
  const normalize = (s) => (s || '').toString().trim().replace(/\s+/g, '').toLowerCase();

  // いまモバイル画面かどうか
  const isMobile = () => location.pathname.indexOf('/k/m/') === 0 || !!document.querySelector(MOBILE_SCROLL_SEL);

  // スクロール対象の要素を返す（モバイル=専用main / PC=scrollingElement）
  function getScrollContainer() {
    return document.querySelector(MOBILE_SCROLL_SEL) || document.scrollingElement || document.documentElement;
  }

  // ====== ラベル要素をテキストで探す ======
  // メモのDOM構造：.control-value-label-gaia の中にラベルテキストがある
  // 行全体は .row-gaia（ジャンプ先として有力）
  function findLabelElement(labelText) {
    const target = normalize(labelText);

    // ラベルのテキスト表示部分を全部集める
    const candidates = document.querySelectorAll('.control-value-label-gaia');
    for (const el of candidates) {
      if (normalize(el.innerText) === target) {
        // 行全体（.row-gaia）を返す。無ければ要素自身
        return el.closest('.row-gaia') || el.closest('.control-label-field-gaia') || el;
      }
    }
    return null;
  }

  // ====== スクロール位置の計算とジャンプ ======
  function scrollToLabel(labelText) {
    const anchor = findLabelElement(labelText);
    if (!anchor) return;

    const container = getScrollContainer();

    // 固定バーが表示中ならその高さも避ける
    const fixedBar = document.getElementById('ktab-fixed-bar');
    const fixedShown = fixedBar && fixedBar.dataset.state === 'shown';
    const fixedHeight = fixedShown ? fixedBar.offsetHeight : 0;
    const offset = FIXED_TOP + fixedHeight;

    if (container === document.scrollingElement || container === document.documentElement) {
      // PC：ページ全体をスクロール
      const top = anchor.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top: top, behavior: 'smooth' });
    } else {
      // モバイル：専用コンテナをスクロール（コンテナ基準の相対座標）
      const top =
        anchor.getBoundingClientRect().top -
        container.getBoundingClientRect().top +
        container.scrollTop -
        offset;
      container.scrollTo({ top: top, behavior: 'smooth' });
    }
  }

  // ====== タブボタンを作る ======
  function createTabButton(tab, isAllTab) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ktab-button';
    btn.textContent = tab.text;
    btn.dataset.elementId = tab.elementId || '';
    btn.dataset.text = tab.text || '';
    btn.dataset.isAll = isAllTab ? 'true' : 'false';

    Object.assign(btn.style, {
      height: '34px',
      padding: '0 14px',
      borderRadius: '8px',
      margin: '3px',
      whiteSpace: 'nowrap',
      border: '1px solid #c8d0d8',
      background: '#ffffff',
      color: '#333333',
      cursor: 'pointer',
      fontSize: '14px'
    });

    btn.addEventListener('click', () => {
      if (isAllTab) {
        // 「すべて表示」タブ：一番上へ戻る
        const container = getScrollContainer();
        if (container === document.scrollingElement || container === document.documentElement) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          container.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } else {
        scrollToLabel(tab.text);
      }
      highlightTab(btn);
    });

    return btn;
  }

  // ====== ハイライト処理 ======
  function highlightTab(activeBtn) {
    document.querySelectorAll('.ktab-button').forEach((b) => {
      const on = (b === activeBtn) ||
                 (activeBtn && b.dataset.elementId === activeBtn.dataset.elementId &&
                  b.dataset.text === activeBtn.dataset.text);
      b.style.background = on ? ACTIVE_BG : '#ffffff';
      b.style.color = on ? ACTIVE_COLOR : '#333333';
      b.style.borderColor = on ? ACTIVE_BG : '#c8d0d8';
    });
  }

  // elementId / text で全タブ（通常バー＋固定バー）をハイライト
  function highlightByText(labelText) {
    const target = normalize(labelText);
    document.querySelectorAll('.ktab-button').forEach((b) => {
      const on = normalize(b.dataset.text) === target;
      b.style.background = on ? ACTIVE_BG : '#ffffff';
      b.style.color = on ? ACTIVE_COLOR : '#333333';
      b.style.borderColor = on ? ACTIVE_BG : '#c8d0d8';
    });
  }

  // ====== タブバーの中身を作る（通常バー・固定バー共通） ======
  function buildTabButtons(host) {
    if (useAllTab) {
      host.appendChild(createTabButton({ text: allTabName }, true));
    }
    tabs.forEach((t) => host.appendChild(createTabButton(t, false)));
  }

  // ====== タブバーを置くスペース要素を取得 ======
  function getTabSpaceElement() {
    // PC
    if (kintone.app && kintone.app.record && kintone.app.record.getSpaceElement) {
      const el = kintone.app.record.getSpaceElement(tabSpaceId);
      if (el) return el;
    }
    // モバイル
    if (kintone.mobile && kintone.mobile.app && kintone.mobile.app.record &&
        kintone.mobile.app.record.getSpaceElement) {
      const el = kintone.mobile.app.record.getSpaceElement(tabSpaceId);
      if (el) return el;
    }
    // フォールバック：user-js- 接頭辞
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
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: '0',
      padding: '4px 8px',
      boxSizing: 'border-box',
      transform: 'translateY(-150%)',
      transition: 'transform 180ms ease-out',
      pointerEvents: 'none'
    });
    bar.dataset.state = 'hidden';

    buildTabButtons(bar);
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
    const baseTop = (container === document.scrollingElement || container === document.documentElement)
      ? 0
      : container.getBoundingClientRect().top;
    const lineY = baseTop + FIXED_TOP + 10; // この高さの線を超えた最後のラベルが「現在地」

    let current = null;
    const all = useAllTab ? [{ text: allTabName, isAll: true }].concat(tabs) : tabs.slice();

    for (const t of tabs) {
      const el = findLabelElement(t.text);
      if (!el) continue;
      const top = el.getBoundingClientRect().top;
      if (top - 1 <= lineY) {
        current = t.text; // 線を超えた＝そこまでスクロール済み
      }
    }

    if (current) {
      highlightByText(current);
    } else if (useAllTab) {
      highlightByText(allTabName);
    }
  }

  // ====== スクロール監視のセットアップ ======
  function setupScrollWatch(spaceEl) {
    const container = getScrollContainer();

    // スペースの絶対位置（これより下にスクロールしたら固定バーを出す）
    const getSpaceBottom = () => {
      const rect = spaceEl.getBoundingClientRect();
      if (container === document.scrollingElement || container === document.documentElement) {
        return rect.bottom + window.pageYOffset;
      }
      return rect.bottom - container.getBoundingClientRect().top + container.scrollTop;
    };

    const onScroll = () => {
      const y = (container === document.scrollingElement || container === document.documentElement)
        ? window.pageYOffset
        : container.scrollTop;

      // スペースが画面外（上）に出たら固定バーを表示
      const spaceBottom = getSpaceBottom();
      if (y > spaceBottom - FIXED_TOP) {
        setFixedBarState(true);
      } else {
        setFixedBarState(false);
      }

      updateActiveByScroll();
    };

    // PC は window、モバイルは専用コンテナ。両方に capture で登録
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    if (container && container.addEventListener) {
      container.addEventListener('scroll', onScroll, { passive: true });
    }

    // 初回判定
    setTimeout(onScroll, 100);
  }

  // ====== キーボード操作（Ctrl + ← / →） ======
  function setupKeyboard() {
    if (!useKeyboard) return;
    document.addEventListener('keydown', (e) => {
      if (!e.ctrlKey) return;
      // 文字入力中は無視
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement.isContentEditable) return;

      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();

      // 現在ハイライト中のタブを探す
      const list = Array.from(document.querySelectorAll('#ktab-fixed-bar .ktab-button, .ktab-base-bar .ktab-button'));
      const uniqueTexts = tabs.map((t) => t.text);
      const activeText = (() => {
        const active = document.querySelector('.ktab-button[style*="' + ACTIVE_BG.replace('#', '') + '"]');
        return active ? active.dataset.text : uniqueTexts[0];
      })();

      let idx = uniqueTexts.indexOf(activeText);
      if (idx === -1) idx = 0;
      idx = e.key === 'ArrowRight' ? Math.min(idx + 1, uniqueTexts.length - 1) : Math.max(idx - 1, 0);
      scrollToLabel(uniqueTexts[idx]);
      highlightByText(uniqueTexts[idx]);
    });
  }

  // ====== メインのセットアップ ======
  function setup() {
    const spaceEl = getTabSpaceElement();

    // タブバーを置く場所：スペースがあればそこ、無ければヘッダー
    let baseHost = spaceEl;
    if (!baseHost) {
      if (kintone.app && kintone.app.record && kintone.app.record.getHeaderMenuSpaceElement) {
        baseHost = kintone.app.record.getHeaderMenuSpaceElement();
      }
    }
    if (!baseHost) return;

    // 二重生成を防ぐ
    if (!baseHost.querySelector('.ktab-button')) {
      baseHost.classList.add('ktab-base-bar');
      Object.assign(baseHost.style, {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0',
        width: '100%',
        boxSizing: 'border-box'
      });
      buildTabButtons(baseHost);
    }

    ensureFixedBar();
    setupScrollWatch(spaceEl || baseHost);
    setupKeyboard();
  }

  // ====== 後片付け（一覧に戻ったときなど） ======
  function teardown() {
    const bar = document.getElementById('ktab-fixed-bar');
    if (bar) bar.remove();
  }

  // ====== kintoneイベント登録 ======
  const showEvents = [
    'app.record.detail.show',
    'app.record.create.show',
    'app.record.edit.show',
    'mobile.app.record.detail.show',
    'mobile.app.record.create.show',
    'mobile.app.record.edit.show'
  ];

  kintone.events.on(showEvents, (event) => {
    // 描画が整うのを少し待ってからセットアップ
    setTimeout(setup, 200);
    return event;
  });

  kintone.events.on(['app.record.index.show', 'mobile.app.record.index.show'], (event) => {
    teardown();
    return event;
  });

  window.addEventListener('hashchange', teardown);

})(window.__TAB_PLUGIN_ID__ || (typeof kintone !== 'undefined' && kintone.$PLUGIN_ID));
