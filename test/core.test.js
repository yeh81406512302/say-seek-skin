// 核心邏輯測試：分數轉譯、商品配對、Agent 指令判斷
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEMO_SCORES, normalizeResults } from '../lib/youcam.js';
import { recommend, summarize, topConcerns } from '../lib/translate.js';
import { handleTurn } from '../lib/agent.js';

const products = JSON.parse(readFileSync(new URL('../data/products.json', import.meta.url)));

test('分數越低越先講：示範資料的前三項是 fine lines、dryness、oiliness', () => {
  const top = topConcerns(DEMO_SCORES);
  assert.deepEqual(top.map((t) => t.key), ['wrinkle', 'moisture', 'oiliness']);
  assert.match(summarize(top), /fine lines, dryness, and oiliness/);
});

test('YouCam 兩種回傳格式都能解析', () => {
  const a = normalizeResults({ output: [{ type: 'pore', ui_score: 92, raw_score: 95.3, mask_urls: ['u'] }] });
  assert.equal(a.pore.raw, 95.3);
  assert.equal(a.pore.mask, 'u');
  const b = normalizeResults({ redness: { raw_score: 40, ui_score: 60 }, all: { score: 70 }, skin_age: 30 });
  assert.deepEqual(Object.keys(b), ['redness']);
});

test('有泛紅時不推薦去角質商品', () => {
  const top = topConcerns({ redness: { raw: 30, ui: 50 }, pore: { raw: 35, ui: 55 }, acne: { raw: 40, ui: 60 } });
  const r = recommend(top, products);
  assert.equal(r.product.exfoliant, false);
});

test('沒說確認就不會加入購物車；說確認才加入', () => {
  const top = topConcerns(DEMO_SCORES);
  const offer = handleTurn('recommend', { top }, products);
  assert.equal(offer.action, 'offer');
  assert.ok(offer.state.pending);
  const other = handleTurn('what does dryness mean', offer.state, products);
  assert.equal(other.state.cart.length, 0);
  const done = handleTurn('confirm', offer.state, products);
  assert.equal(done.action, 'add_to_cart');
  assert.equal(done.state.cart.length, 1);
  const no = handleTurn('no thanks', offer.state, products);
  assert.equal(no.state.pending, null);
  assert.equal(no.state.cart.length, 0);
});

test('醫療問題一律不判斷', () => {
  const r = handleTurn('is this a rash or eczema', { top: topConcerns(DEMO_SCORES) }, products);
  assert.match(r.say, /dermatologist/);
});

test('"say that again" 是重唸，不是重拍', () => {
  const r = handleTurn('can you say that again', { top: topConcerns(DEMO_SCORES) }, products);
  assert.equal(r.action, undefined);
  const c = handleTurn('check my skin', { top: [] }, products);
  assert.equal(c.action, 'capture');
});
