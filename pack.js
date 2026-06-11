/**
 * pack.js - kintoneプラグインのパッケージングスクリプト
 *
 * 公式の @kintone/plugin-packer と同じ形式で plugin.zip を作る
 * （ネット接続が無い環境でも node 標準機能だけで動くようにした自作版）
 *
 * 仕組み（kintoneプラグインの公式フォーマット）:
 *   plugin.zip の中身は3ファイル
 *     - contents.zip : プラグインのソース一式（src/ の中身）
 *     - PUBKEY       : 公開鍵（DER形式）
 *     - SIGNATURE    : contents.zip への電子署名（RSA-SHA1）
 *   プラグインIDは公開鍵から自動計算される
 *   → 同じ秘密鍵（private.ppk）を使い続ける限り、同じプラグインIDで更新できる
 *
 * 使い方:  node pack.js
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE = __dirname;
const SRC_DIR = path.join(BASE, 'plugin');
const PPK_PATH = path.join(BASE, 'private.ppk');
const CONTENTS_ZIP = path.join(BASE, 'contents.zip');
const PLUGIN_ZIP = path.join(BASE, 'plugin.zip');

// ------------------------------------------------------------
// 1. 秘密鍵の用意（private.ppk が無ければ新規作成、あれば再利用）
//    ※2回目以降のビルドで同じプラグインIDを保つため、絶対に削除しないこと
// ------------------------------------------------------------
let privatePem;
if (fs.existsSync(PPK_PATH)) {
  privatePem = fs.readFileSync(PPK_PATH, 'utf8');
  console.log('既存の秘密鍵を使用:', PPK_PATH);
} else {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 1024, // 公式plugin-packerと同じ鍵長
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  privatePem = privateKey;
  fs.writeFileSync(PPK_PATH, privatePem);
  console.log('秘密鍵を新規作成:', PPK_PATH);
}

// 公開鍵をDER形式で取り出す（PUBKEYファイルになる）
const publicDer = crypto.createPublicKey(privatePem).export({
  type: 'spki',
  format: 'der',
});

// ------------------------------------------------------------
// 2. src/ の中身を contents.zip に固める
// ------------------------------------------------------------
if (fs.existsSync(CONTENTS_ZIP)) fs.unlinkSync(CONTENTS_ZIP);
execSync('zip -r -X "' + CONTENTS_ZIP + '" . -x ".*"', { cwd: SRC_DIR });
const contents = fs.readFileSync(CONTENTS_ZIP);

// ------------------------------------------------------------
// 3. contents.zip に電子署名する（RSA-SHA1：公式と同じ方式）
// ------------------------------------------------------------
const signer = crypto.createSign('RSA-SHA1');
signer.update(contents);
const signature = signer.sign(privatePem);

// ------------------------------------------------------------
// 4. プラグインIDを計算（公開鍵のSHA-256から生成：公式と同じ計算）
// ------------------------------------------------------------
const hex = crypto.createHash('sha256').update(publicDer).digest('hex').slice(0, 32);
const pluginId = hex.replace(/[0-9a-f]/g, function (c) {
  return 'abcdefghijklmnop'[parseInt(c, 16)];
});

// ------------------------------------------------------------
// 5. plugin.zip に3ファイルをまとめる
// ------------------------------------------------------------
const tmpDir = path.join(BASE, '.pack-tmp');
fs.rmSync(tmpDir, { recursive: true, force: true });
fs.mkdirSync(tmpDir);
fs.copyFileSync(CONTENTS_ZIP, path.join(tmpDir, 'contents.zip'));
fs.writeFileSync(path.join(tmpDir, 'PUBKEY'), publicDer);
fs.writeFileSync(path.join(tmpDir, 'SIGNATURE'), signature);

if (fs.existsSync(PLUGIN_ZIP)) fs.unlinkSync(PLUGIN_ZIP);
execSync('zip -X -j "' + PLUGIN_ZIP + '" contents.zip PUBKEY SIGNATURE', { cwd: tmpDir });
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log('----------------------------------------');
console.log('plugin.zip を作成しました:', PLUGIN_ZIP);
console.log('プラグインID:', pluginId);
console.log('※ private.ppk は必ずバックアップしてください（紛失すると同じIDで更新不可）');
