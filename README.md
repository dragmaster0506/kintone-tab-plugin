# kintone タブ表示プラグイン

kintone のレコード画面（詳細・新規作成・編集、PC・モバイル両対応）を、
**要素IDを設定したラベルを境目に自動でタブ表示** にするプラグイン。

## 機能

- ラベル（要素ID付き）を境目にフォームを自動分割。タブ名＝ラベルのテキスト
- 最初の境目ラベルより上のフィールドは常に表示
- タブバーは指定した要素IDのスペースに表示（無ければヘッダーに表示）
- 「すべて表示」タブ（設定でON/OFF・名前変更可）
- スクロール追従（タブバーが画面外に出たら上部に固定）
- キーボードでタブ移動（Ctrl + ←／→、設定でON/OFF可）

## ファイル構成

```
kintone-tab-plugin/
├── desktop.js        ← 【メイン処理】GitHub Pages で公開。ここを更新するだけで全アプリに自動反映
├── plugin/           ← plugin.zip のソースフォルダ
│   ├── manifest.json
│   ├── image/icon.png
│   ├── js/bootstrap.js   ← プラグインID橋渡し用（1行だけ）
│   ├── js/config.js      ← 設定画面ロジック
│   ├── html/config.html  ← 設定画面HTML
│   └── css/config.css    ← 設定画面スタイル
├── pack.js           ← パッケージングスクリプト（node pack.js）
└── private.ppk       ← 【重要・git管理外】秘密鍵。絶対に削除・紛失しないこと
```

## 自動更新の仕組み

```
[kintone] manifest.json が読み込む順序
  1. js/bootstrap.js（プラグイン内・kintone.$PLUGIN_ID をグローバル変数に保存）
  2. https://dragmaster0506.github.io/kintone-tab-plugin/desktop.js（GitHub Pages）
```

## 更新作業

### desktop.js を更新する（通常の更新。plugin.zip 配り直し不要）

```bash
git pull
# desktop.js を編集
git add desktop.js
git commit -m "fix: 変更内容を一言で"
git push
# 数分後に全アプリへ自動反映（反映されない時は Ctrl+Shift+R）
```

### plugin.zip を作り直す（設定画面・manifest を変えたとき）

```bash
node pack.js
# または: npx @kintone/plugin-packer --ppk private.ppk plugin/
```

manifest.json の `version` を +1 してから実行し、
生成された plugin.zip を kintone システム管理に再アップロードする。

> **注意**: 秘密鍵（private.ppk）を変えると別プラグイン扱いになり全アプリで入れ直しになる。
> private.ppk は .gitignore 済み（公開リポジトリに含めない）。Google Drive 等へ必ずバックアップ。

## プラグイン設定項目

| 設定項目 | キー名 | 初期値 |
|---|---|---|
| タブバーを表示するスペースの要素ID | `tabSpaceId` | `tab_space` |
| 「すべて表示」タブを使う | `showAllTab` | `true` |
| 「すべて表示」タブの名前 | `allTabName` | `すべて` |
| キーボードでタブ移動（Ctrl+←→） | `keyboardShortcut` | `true` |

## フォーム側の準備（アプリごと）

1. タブの境目にしたい位置にラベルを置き、**要素ID** を設定（タブ名＝ラベルの文字）
2. タブバーを表示したい位置にスペースを置き、要素IDに `tab_space`（設定画面で変更可）を設定
3. アプリにプラグインを追加して設定を保存 → アプリを更新

## 前提

- 2026年2月アップデート（ラベル・罫線への要素ID付与、setFieldShown のラベル対応）以降の kintone
