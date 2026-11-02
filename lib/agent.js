// 對話協調 Agent：判斷使用者這句話想做什麼，決定下一步
// 伺服器不存狀態：前端每次把目前狀態（結果、待確認商品、購物車）一起送來

import { CONCERNS, findConcern, recommend, summarize } from './translate.js';

const has = (t, words) => words.some((w) => new RegExp(`\\b${w}\\b`).test(t));

// 涉及疾病判斷的字詞：一律不回答，改建議看皮膚科
const MEDICAL = ['disease', 'diagnose', 'diagnosis', 'infection', 'infected', 'rash', 'eczema', 'psoriasis',
  'rosacea', 'cancer', 'melanoma', 'mole', 'allergy', 'allergic', 'prescription', 'medicine', 'medication'];

const HELP = 'You can say "check my skin" to take a new photo, "repeat" to hear the results again, ' +
  '"what does redness mean" to learn about one item, "recommend" for a next step, or "my cart".';

/**
 * @param {string} text  使用者說的話（語音辨識結果或按鈕文字）
 * @param {object} state { top: [], pending: product|null, cart: [] }
 * @param {Array} products 示範商品目錄
 * @returns {{ say: string, action?: string, state: object }}
 */
export function handleTurn(text, state, products) {
  const t = (text || '').toLowerCase().trim();
  const s = { top: state?.top || [], pending: state?.pending || null, cart: state?.cart || [] };

  if (!t) return { say: "I didn't catch that. " + HELP, state: s };

  // 1. 醫療問題：守住界線
  if (has(t, MEDICAL)) {
    return {
      say: "I can't judge medical conditions. These results are cosmetic skin insights, not a diagnosis. " +
        'For anything that worries you, please ask a dermatologist.',
      state: s,
    };
  }

  // 2. 有待確認的商品時，先處理「確認／不要」
  if (s.pending) {
    if (has(t, ['confirm', 'yes', 'yeah', 'sure', 'add it'])) {
      const item = s.pending;
      return {
        say: `Done. ${item.name} is in your cart. Your cart has ${s.cart.length + 1} item${s.cart.length ? 's' : ''}.`,
        action: 'add_to_cart',
        state: { ...s, pending: null, cart: [...s.cart, item] },
      };
    }
    if (has(t, ['no', 'nope', 'cancel', 'not now', "don't"])) {
      return { say: "Okay, I won't add it. " + 'You can say "recommend" again any time.', state: { ...s, pending: null } };
    }
  }

  // 3. 再唸一次（放在重拍之前，避免 "say that again" 被當成重拍）
  if (has(t, ['repeat', 'say that again', 'what did you say', 'once more'])) {
    if (!s.top.length) return { say: 'We have no results yet. Say "check my skin" to start.', state: s };
    return { say: summarize(s.top), state: s };
  }

  // 4. 購物車
  if (has(t, ['cart', 'basket'])) {
    if (!s.cart.length) return { say: 'Your cart is empty.', state: s };
    const total = s.cart.reduce((n, p) => n + p.price, 0);
    return { say: `Your cart has ${s.cart.map((p) => p.name).join(', and ')}. The total is ${total} dollars.`, state: s };
  }

  // 5. 重新拍照
  if (has(t, ['check my skin', 'check my face', 'retake', 'try again', 'new photo', 'another photo', 'scan', 'analyze', 'analyse'])) {
    return { say: "Let's take a new photo. Hold the phone at eye level.", action: 'capture', state: { ...s, pending: null } };
  }

  if (!s.top.length) {
    return { say: 'We have no results yet. Say "check my skin" to start.', state: s };
  }

  // 6. 解釋某一項
  const c = findConcern(t);
  if (c && !has(t, ['recommend', 'suggest', 'buy'])) {
    const found = s.top.find((x) => x.key === c);
    const extra = found ? ` In your photo, this ${found.level}.` : ' It was not one of your top three today.';
    return { say: CONCERNS[c].explain + extra + ' ' + CONCERNS[c].tip, state: s };
  }

  // 7. 給建議（只給一個步驟＋一項商品），等使用者確認
  if (has(t, ['recommend', 'recommendation', 'suggest', 'suggestion', 'advice', 'next step', 'what should i', 'buy', 'product'])) {
    const r = recommend(s.top, products);
    if (!r) return { say: "I don't have a matching product on the demo shelf for this result.", state: s };
    return { say: r.spoken, action: 'offer', state: { ...s, pending: r.product } };
  }

  if (has(t, ['help', 'what can i say', 'options'])) return { say: HELP, state: s };

  // 沒有待確認的商品時說「確認」：說清楚目前沒有東西要確認
  if (has(t, ['confirm', 'yes'])) {
    return { say: 'There is nothing to confirm right now. Say "recommend" to hear a suggested product first.', state: s };
  }

  return { say: "Sorry, I didn't understand. " + HELP, state: s };
}
