// YouCam AI Skin Analysis API 串接（File API 上傳 → 建立任務 → 輪詢結果）
// 依官方文件：https://docs.perfectcorp.com/reference/ai_skin_analysis

const BASE = process.env.YOUCAM_API_BASE || 'https://yce-api-01.makeupar.com/s2s/v2.0';

// SD 模式分析 8 項膚況（5–8 項每次扣 12 點；SD 與 HD 不能混用）
export const SKIN_ACTIONS = [
  'acne', 'redness', 'oiliness', 'moisture', 'pore', 'texture', 'dark_circle_v2', 'wrinkle',
];

// YouCam 回傳的錯誤代碼 → 可以唸給使用者聽的說明
const ERROR_HINTS = {
  error_src_face_too_small: 'Your face was too far from the camera. Please hold the phone a little closer.',
  error_src_face_out_of_bound: 'Part of your face was outside the picture. Please keep your face in the middle.',
  error_lighting_dark: 'The photo was too dark. Please face a window or a lamp and try again.',
  error_below_min_image_size: 'The photo was too small. Please try again.',
};

export class YouCamError extends Error {
  constructor(message, code, spoken) {
    super(message);
    this.code = code;
    // spoken：給前端直接朗讀的句子
    this.spoken = spoken || ERROR_HINTS[code] || 'Sorry, the skin analysis did not work this time. Let us try once more.';
  }
}

async function call(path, { method = 'GET', body, apiKey }) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json.status && json.status !== 200)) {
    const code = json.error_code || json.error || `http_${res.status}`;
    throw new YouCamError(`YouCam ${method} ${path} failed: ${json.error || res.status}`, code);
  }
  return json.data;
}

// 步驟 1–2：向 File API 取得上傳網址，再把照片 PUT 上去
async function uploadImage(buffer, contentType, apiKey) {
  const ext = contentType === 'image/png' ? 'png' : 'jpg';
  const data = await call('/file', {
    method: 'POST',
    apiKey,
    body: { files: [{ content_type: contentType, file_name: `selfie_${Date.now()}.${ext}`, file_size: buffer.length }] },
  });
  const file = data.files[0];
  const req = file.requests[0];
  const put = await fetch(req.url, { method: req.method || 'PUT', headers: req.headers, body: buffer });
  if (!put.ok) throw new YouCamError(`Upload to storage failed: ${put.status}`, 'upload_failed');
  return file.file_id;
}

// 把兩種可能的回傳格式（output 陣列 或 score_info 物件）統一成 { 項目: {raw, ui, mask} }
export function normalizeResults(results) {
  const scores = {};
  if (Array.isArray(results?.output)) {
    for (const o of results.output) {
      scores[o.type] = { raw: Number(o.raw_score), ui: Number(o.ui_score), mask: o.mask_urls?.[0] || null };
    }
  } else if (results && typeof results === 'object') {
    for (const [k, v] of Object.entries(results)) {
      if (v && typeof v === 'object' && 'raw_score' in v) {
        scores[k] = { raw: Number(v.raw_score), ui: Number(v.ui_score), mask: v.mask_url || null };
      }
    }
  }
  return scores;
}

// 主流程：上傳 → 建任務 → 每 2 秒查一次，最多等 90 秒
export async function analyzeSkin(buffer, contentType, apiKey) {
  const fileId = await uploadImage(buffer, contentType, apiKey);
  const task = await call('/task/skin-analysis', {
    method: 'POST',
    apiKey,
    body: { src_file_id: fileId, dst_actions: SKIN_ACTIONS, format: 'json' },
  });
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    const d = await call(`/task/skin-analysis/${encodeURIComponent(task.task_id)}`, { apiKey });
    if (d.task_status === 'success') return normalizeResults(d.results);
    if (d.task_status === 'error') {
      const code = d.error_code || d.error || 'task_error';
      throw new YouCamError(`Skin analysis task error: ${code}`, code);
    }
  }
  throw new YouCamError('Skin analysis timed out', 'timeout', 'The analysis is taking too long. Please try again in a moment.');
}

// 沒有 API 金鑰時的示範資料：取自官方文件的 SD 範例分數，前端會明確標示「DEMO DATA」
export const DEMO_SCORES = {
  wrinkle: { raw: 36.09, ui: 60, mask: null },
  acne: { raw: 92.3, ui: 88, mask: null },
  moisture: { raw: 48.69, ui: 70, mask: null },
  dark_circle_v2: { raw: 80.2, ui: 76, mask: null },
  redness: { raw: 72.01, ui: 77, mask: null },
  oiliness: { raw: 60.74, ui: 72, mask: null },
  pore: { raw: 88.38, ui: 84, mask: null },
  texture: { raw: 80.1, ui: 76, mask: null },
};
