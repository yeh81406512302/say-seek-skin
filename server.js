// Say & Seek Skin 後端：靜態網頁＋三個 API
// 不需安裝任何套件（只用 Node 內建模組），方便評審直接執行
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeSkin, DEMO_SCORES, YouCamError } from './lib/youcam.js';
import { summarize, topConcerns } from './lib/translate.js';
import { handleTurn } from './lib/agent.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.YOUCAM_API_KEY || '';
const DEMO = !API_KEY; // 沒有金鑰就用示範資料，前端會標示
const products = JSON.parse(await readFile(join(ROOT, 'data', 'products.json'), 'utf8'));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function readJson(req, limit = 12 * 1024 * 1024) {
  const chunks = []; let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error('Request too large');
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

// POST /api/analyze  { image: "data:image/jpeg;base64,..." }
async function analyze(req, res) {
  const { image } = await readJson(req);
  let scores;
  if (DEMO) {
    await new Promise((r) => setTimeout(r, 1200)); // 模擬等待
    scores = DEMO_SCORES;
  } else {
    const m = /^data:(image\/(?:jpeg|png));base64,(.+)$/.exec(image || '');
    if (!m) return send(res, 400, { error: 'bad_image', spoken: 'I did not receive a photo. Let us try again.' });
    scores = await analyzeSkin(Buffer.from(m[2], 'base64'), m[1], API_KEY);
  }
  const top = topConcerns(scores, 3);
  send(res, 200, { demo: DEMO, scores, top, say: summarize(top) });
}

// POST /api/turn  { text, state }
async function turn(req, res) {
  const { text, state } = await readJson(req, 256 * 1024);
  send(res, 200, handleTurn(text, state, products));
}

async function serveStatic(req, res) {
  const url = new URL(req.url, 'http://x');
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(PUBLIC, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(PUBLIC)) return send(res, 403, { error: 'forbidden' });
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    send(res, 404, { error: 'not_found' });
  }
}

http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/api/config') return send(res, 200, { demo: DEMO });
    if (req.method === 'POST' && req.url === '/api/analyze') return await analyze(req, res);
    if (req.method === 'POST' && req.url === '/api/turn') return await turn(req, res);
    if (req.method === 'GET') return await serveStatic(req, res);
    send(res, 405, { error: 'method_not_allowed' });
  } catch (err) {
    console.error(err);
    const spoken = err instanceof YouCamError ? err.spoken : 'Something went wrong on our side. Please try again.';
    send(res, 502, { error: err.code || 'server_error', spoken });
  }
}).listen(PORT, () => {
  console.log(`Say & Seek Skin running at http://localhost:${PORT} ${DEMO ? '(DEMO DATA: no YOUCAM_API_KEY set)' : '(YouCam API live)'}`);
});
