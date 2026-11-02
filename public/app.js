// Say & Seek Skin 前端：語音輸入輸出、YouCam Camera Kit 對位、結果與購物車
const $ = (id) => document.getElementById(id);
const state = { top: [], pending: null, cart: [] }; // 送給後端 Agent 的對話狀態
let lastSay = '';
let session = false;   // 使用者按下開始後才開始聽
let busy = false;      // 拍照或分析中，不聽指令
let speaking = false;

// ---------------- 語音輸出 ----------------
function speak(text, { interrupt = true } = {}) {
  lastSay = text;
  setStatus(text);
  log('app', text);
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve();
    if (interrupt) speechSynthesis.cancel();
    stopListening();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.95;
    speaking = true;
    // 有些瀏覽器不會觸發 onend：依字數估算時間，逾時就當作唸完，避免流程卡住
    let done = false;
    const finish = () => { if (done) return; done = true; speaking = false; resolve(); resumeListening(); };
    u.onend = u.onerror = finish;
    setTimeout(finish, 1500 + text.length * 75);
    speechSynthesis.speak(u);
  });
}

// 對位提示：同一句 4 秒內不重複唸，避免吵
let lastHint = '', lastHintAt = 0;
function speakHint(text) {
  $('hint').textContent = text;
  const now = Date.now();
  if (text === lastHint && now - lastHintAt < 4000) return;
  if (speaking && text === lastHint) return;
  lastHint = text; lastHintAt = now;
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US'; u.rate = 1.0;
  speechSynthesis.speak(u);
}

// ---------------- 語音輸入 ----------------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recog = null, listening = false;
if (SR) {
  recog = new SR();
  recog.lang = 'en-US';
  recog.continuous = false;
  recog.interimResults = false;
  recog.onresult = (e) => {
    const text = e.results[0][0].transcript;
    handleText(text, 'voice');
  };
  recog.onend = () => { listening = false; $('mic').hidden = true; resumeListening(); };
  recog.onerror = () => { listening = false; $('mic').hidden = true; };
}
function startListening() {
  if (!recog || listening || speaking || busy || !session) return;
  try { recog.start(); listening = true; $('mic').hidden = false; } catch { /* 已在聽 */ }
}
function stopListening() {
  if (recog && listening) { try { recog.abort(); } catch {} }
  listening = false; $('mic').hidden = true;
}
function resumeListening() { setTimeout(startListening, 350); }

// ---------------- 畫面小工具 ----------------
// 長句改用小一級的字，避免一句話佔滿整個手機畫面
function setStatus(t) { $('status').textContent = t; $('status').classList.toggle('long', t.length > 110); }
function log(who, text) {
  const li = document.createElement('li');
  li.className = who; li.textContent = (who === 'you' ? 'You: ' : 'App: ') + text;
  $('log').appendChild(li);
}

// 分析時每 1.5 秒輕響一聲，讓看不到畫面的人知道還在進行
let tickTimer = null, audioCtx = null;
function startTicks() {
  try {
    audioCtx = audioCtx || new AudioContext();
    tickTimer = setInterval(() => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = 660; g.gain.value = 0.06;
      o.connect(g).connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + 0.08);
    }, 1500);
  } catch {}
}
function stopTicks() { clearInterval(tickTimer); tickTimer = null; }

// ---------------- YouCam JS Camera Kit ----------------
let kitLoaded = false, kitReady = false, kitTimer = null;

// 把 Camera Kit 的品質回報轉成一句語音提示
function hintFromQuality(q) {
  if (!q.hasFace) return "I can't see your face. Hold the phone at eye level, about an arm's length away.";
  if (q.position === 'toosmall') return 'Move the phone a little closer to your face.';
  if (q.position === 'outofboundary') return 'Move the phone back a little, and keep your face in the middle.';
  if (q.position === 'notgood') return 'Keep your face in the middle of the screen.';
  if (q.frontal === 'notgood') return 'Look straight at the phone.';
  if (q.lighting === 'notgood') return "It's a bit dark. Try facing a window or a lamp.";
  return 'Great. Hold still.';
}

function loadCameraKit() {
  return new Promise((resolve, reject) => {
    if (kitLoaded) return resolve();
    // 官方規定：必須在載入 SDK 前定義 YMKAsyncInit
    window.YMKAsyncInit = () => {
      if (kitLoaded) return; // 只註冊一次
      YMK.addEventListener('faceQualityChanged', (q) => speakHint(hintFromQuality(q)));
      YMK.addEventListener('cameraOpened', () => { kitReady = true; clearTimeout(kitTimer); });
      YMK.addEventListener('cameraFailed', () => cameraUnavailable());
      YMK.addEventListener('unsupportedResolution', () => cameraUnavailable());
      YMK.addEventListener('faceDetectionCaptured', onCaptured);
      kitLoaded = true;
      resolve();
    };
    const s = document.createElement('script');
    s.src = 'https://plugins-media.makeupar.com/v2.5-camera-kit/sdk.js';
    s.onerror = () => reject(new Error('Camera Kit failed to load'));
    // 有時 SDK 載入後不會自動呼叫 YMKAsyncInit：半秒後自己補呼叫
    s.onload = () => setTimeout(() => { if (!kitLoaded && window.YMK) window.YMKAsyncInit(); }, 500);
    document.body.appendChild(s);
  });
}

async function startCapture() {
  busy = true;
  stopListening();
  $('fallback').hidden = true;
  $('cameraWrap').hidden = false;
  await speak("Let's take a photo. Hold the phone at eye level and look at it. I'll tell you how to move.");
  try {
    await loadCameraKit();
    kitReady = false;
    YMK.init({
      faceDetectionMode: 'skincare',
      imageFormat: 'base64',
      language: 'enu',
      qualityLevel: 'relaxed',
      countingDuration: 1500,
      width: Math.min(window.innerWidth - 32, 480),
      height: Math.min(Math.round((window.innerWidth - 32) * 1.33), 640),
    });
    YMK.openCameraKit();
    // 12 秒內相機沒打開，就改用備援
    kitTimer = setTimeout(() => { if (!kitReady) cameraUnavailable(); }, 12000);
  } catch {
    cameraUnavailable();
  }
}

function closeKit() {
  try { if (window.YMK) YMK.close(); } catch {}
  $('cameraWrap').hidden = true;
  $('hint').textContent = '';
}

function cameraUnavailable() {
  clearTimeout(kitTimer);
  closeKit();
  busy = false;
  $('fallback').hidden = false;
  speak("I couldn't open the camera. You can choose a selfie from your photos instead.");
}

async function onCaptured(result) {
  const item = result.images?.[0];
  if (!item) return;
  closeKit();
  const image = typeof item.image === 'string' ? item.image : await blobToDataUrl(item.image);
  analyze(image);
}

const blobToDataUrl = (b) => new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });

// 備援：自己選照片（縮到長邊 1600 以內再送）
async function fileToDataUrl(file) {
  const url = await blobToDataUrl(file);
  const img = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = url; });
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.92);
}

// ---------------- 呼叫後端 ----------------
async function analyze(image) {
  busy = true;
  $('fallback').hidden = true;
  speak('Got it. Analyzing your skin. This takes a few seconds.');
  startTicks();
  try {
    const res = await fetch('/api/analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image }),
    });
    const data = await res.json();
    stopTicks();
    busy = false;
    if (!res.ok) {
      $('fallback').hidden = false;
      return speak(data.spoken || 'Sorry, that did not work. Say "check my skin" to try again.');
    }
    state.top = data.top; state.pending = null;
    renderResults(data);
    await speak(data.say);
  } catch {
    stopTicks(); busy = false;
    speak('I lost the connection. Please check the internet and say "check my skin" to try again.');
  }
}

async function handleText(text, source = 'button') {
  log('you', text);
  if (source === 'voice') setStatus(`You said: “${text}”`);
  const res = await fetch('/api/turn', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, state }),
  });
  const data = await res.json();
  Object.assign(state, data.state);
  if (data.action === 'capture') { closeKit(); return startCapture(); }
  if (data.action === 'offer') renderOffer(state.pending);
  if (data.action === 'add_to_cart') { renderOffer(null); renderCart(); }
  if (!state.pending) renderOffer(null);
  speak(data.say);
}

// ---------------- 畫面更新 ----------------
function renderResults(data) {
  $('results').hidden = false;
  $('commands').hidden = false;
  const ol = $('topList'); ol.innerHTML = '';
  for (const t of data.top) {
    const li = document.createElement('li');
    // 長條代表「需要注意的程度」：分數越低（越需要注意）長條越長
    const need = Math.max(5, Math.min(100, 100 - t.raw));
    li.innerHTML = `<span class="name"></span><span class="lvl"></span><div class="bar" aria-hidden="true"><i style="width:${need}%"></i></div>`;
    li.querySelector('.name').textContent = t.name;
    li.querySelector('.lvl').textContent = `${capitalize(t.level)} · score ${Math.round(t.raw)}/100 (higher is healthier)`;
    ol.appendChild(li);
  }
  $('explainBtn').dataset.say = data.top[0] ? `what does ${data.top[0].name} mean` : 'help';
  $('explainBtn').textContent = data.top[0] ? `Explain ${data.top[0].name}` : 'Help';
  const m = data.top.find((t) => t.mask);
  $('mask').hidden = !m;
  if (m) { $('mask').src = m.mask; $('mask').alt = `Areas detected for ${m.name}`; }
}

function renderOffer(p) {
  $('offer').hidden = !p;
  if (p) $('offerText').textContent = `${p.name} · $${p.price} — say “confirm” to add`;
}

function renderCart() {
  $('cartBox').hidden = !state.cart.length;
  $('cartList').innerHTML = '';
  for (const p of state.cart) {
    const li = document.createElement('li'); li.textContent = `${p.name} — $${p.price}`; $('cartList').appendChild(li);
  }
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------- 事件綁定 ----------------
$('startBtn').addEventListener('click', async () => {
  session = true;
  $('startBtn').hidden = true;
  try { audioCtx = audioCtx || new AudioContext(); } catch {}
  if (!SR) log('app', 'Voice input is not supported in this browser. Use the buttons instead.');
  startCapture();
});

$('commands').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-say]');
  if (b) handleText(b.dataset.say);
});

$('fileInput').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (f) analyze(await fileToDataUrl(f));
});

$('demoBtn').addEventListener('click', () => analyze('demo'));

fetch('/api/config').then((r) => r.json()).then((c) => {
  $('demoBadge').hidden = !c.demo;
  $('demoBtn').hidden = !c.demo;
});
