// 把 YouCam 的 0–100 分數轉成「聽得懂」的句子與下一步建議
// 規則式（不用語言模型），確保每次說法一致、不講出分數沒支持的內容
// 注意：YouCam 的分數「越高越健康」，所以最該注意的是分數最低的項目

// 每項膚況的白話名稱、一句解釋、一句今日建議
export const CONCERNS = {
  acne: {
    name: 'blemishes',
    explain: 'Blemishes means the analysis found some spots or breakouts. It is common and often changes week to week.',
    tip: 'Keep your routine gentle and avoid picking at spots.',
  },
  redness: {
    name: 'redness',
    explain: 'Redness means some areas look pinker than the rest of your face. It often shows up when skin is irritated or dry.',
    tip: 'Skip scrubs and strong exfoliants today, and use something soothing.',
  },
  oiliness: {
    name: 'oiliness',
    explain: 'Oiliness means your skin is producing more shine, usually on the forehead and nose.',
    tip: 'A light, oil-free moisturizer is enough. You do not need to wash more often.',
  },
  moisture: {
    name: 'dryness',
    explain: 'Dryness means your skin is holding less water than it could. It can feel tight after washing.',
    tip: 'Apply moisturizer while your skin is still a little damp.',
  },
  pore: {
    name: 'visible pores',
    explain: 'Visible pores means the pores look larger, usually around the nose and cheeks.',
    tip: 'Keep pores clear with gentle cleansing. A mild exfoliant a few times a week can help.',
  },
  texture: {
    name: 'uneven texture',
    explain: 'Uneven texture means the skin surface looks less smooth in some areas.',
    tip: 'Hydration and daily sunscreen help texture over time.',
  },
  dark_circle_v2: {
    name: 'dark circles',
    explain: 'Dark circles means the area under your eyes looks darker than the rest of your face. Sleep and genetics both play a part.',
    tip: 'A gentle eye cream and good sleep can help.',
  },
  wrinkle: {
    name: 'fine lines',
    explain: 'Fine lines means the analysis found some lines, often around the eyes and forehead.',
    tip: 'Daily sunscreen and steady hydration are the simplest first steps.',
  },
};

// 分數區間對應的說法（設計假設，之後依使用者測試調整）
function level(raw) {
  if (raw < 50) return 'stands out the most';
  if (raw < 70) return 'is noticeable';
  return 'is mild';
}

// 依分數由低到高排序，取最需要注意的 n 項
export function topConcerns(scores, n = 3) {
  return Object.entries(scores)
    .filter(([k, v]) => CONCERNS[k] && Number.isFinite(v.raw))
    .sort((a, b) => a[1].raw - b[1].raw)
    .slice(0, n)
    .map(([key, v]) => ({ key, name: CONCERNS[key].name, raw: v.raw, ui: v.ui, mask: v.mask, level: level(v.raw) }));
}

// 第一段要唸出來的結果摘要
export function summarize(top) {
  if (!top.length) return 'I could not read any results from this photo. Let us try once more.';
  const allMild = top.every((t) => t.raw >= 70);
  if (allMild) {
    return `Your skin looks fairly balanced today. The area with the most room to improve is ${top[0].name}. ` +
      'You can ask what it means, or say "recommend" for a next step.';
  }
  const names = top.map((t) => t.name);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}` : names[0];
  return `Here are the three things that stand out today: ${list}. ` +
    `The one to focus on first is ${top[0].name}. ` +
    'You can ask what any of these means, say "repeat", or say "recommend" for a next step.';
}

// 為使用者挑「一個保養步驟＋一項商品」
// 規則：有泛紅時不推薦去角質商品；依最需要注意的項目優先配對
export function recommend(top, products) {
  if (!top.length) return null;
  const hasRedness = top.some((t) => t.key === 'redness');
  for (const t of top) {
    const p = products.find((x) => x.tags.includes(t.key) && !(hasRedness && x.exfoliant));
    if (p) {
      const why = CONCERNS[t.key].name;
      const tip = hasRedness && t.key !== 'redness' ? CONCERNS.redness.tip : CONCERNS[t.key].tip;
      return {
        product: p,
        concern: t.key,
        spoken: `For ${why}, here is one simple step: ${tip} ` +
          `From our demo shelf, ${p.name} is ${p.spoken}, for ${p.price} dollars. ${p.routine} ` +
          'Would you like to add it to your cart? Say "confirm" or "no".',
      };
    }
  }
  return null;
}

// 使用者說的是哪一項膚況（支援同義詞）
const SYNONYMS = {
  acne: ['acne', 'blemish', 'blemishes', 'breakout', 'pimple', 'spots'],
  redness: ['redness', 'red'],
  oiliness: ['oily', 'oiliness', 'oil', 'shine', 'shiny'],
  moisture: ['dry', 'dryness', 'moisture', 'hydration'],
  pore: ['pore', 'pores'],
  texture: ['texture', 'uneven', 'rough'],
  dark_circle_v2: ['dark circle', 'dark circles', 'under eye', 'eyes'],
  wrinkle: ['wrinkle', 'wrinkles', 'fine line', 'fine lines', 'lines'],
};
export function findConcern(text) {
  const t = ` ${text.toLowerCase()} `;
  for (const [k, words] of Object.entries(SYNONYMS)) {
    if (words.some((w) => t.includes(` ${w} `) || t.includes(` ${w}?`) || t.includes(` ${w}.`))) return k;
  }
  return null;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
