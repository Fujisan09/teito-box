// v4 checks: sample photos, main+2 sub cap, formats (PNG/WebP/GIF/BMP/TIFF/HEIC), picker, login autofill/remember, phone cards.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = process.argv[2] || '/home/claude/teito-box';
const OUT = process.argv[3] || __dirname + '/shots_v4';
const DEVICE = process.argv[4] || 'desktop';
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
}).listen(0);
const fails = [];
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails.push(msg); };
const imgInfo = el => ({ nw: el.naturalWidth, nh: el.naturalHeight, w: el.clientWidth, h: el.clientHeight, fit: getComputedStyle(el).objectFit, src: el.getAttribute('src').slice(0, 30) });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(DEVICE === 'mobile'
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  if (process.env.UI) await page.addInitScript(u => { try { localStorage.setItem('tb_ui', u) } catch (e) {} }, process.env.UI);
  const errors = [], toasts = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|fonts\.googleapis/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.exposeFunction('__toast', t => toasts.push(t));
  await page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.classList && n.classList.contains('toast')) window.__toast(n.textContent); }))).observe(document.documentElement, { childList: true, subtree: true })); });
  const url = `http://localhost:${server.address().port}/?v=4`;
  const tap = async sel => { if (DEVICE === 'mobile') { await page.waitForSelector(sel); await page.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), sel); await page.waitForTimeout(150); await page.click(sel, { force: true }); } else await page.click(sel); };

  // ---- 1. fresh device: sample items carry photos ----
  await page.goto(url); await page.waitForSelector('#g_form');
  await page.fill('#g_code', 'S-001'); await page.fill('#g_pin', '1234'); await tap('#g_go');
  await page.waitForSelector('tr.rowbtn');
  await page.waitForFunction(() => [...document.querySelectorAll('img.thumb')].every(i => i.complete && i.naturalWidth > 0));
  let th = await page.$$eval('img.thumb', (els, fn) => els.map(eval(fn)), imgInfo.toString());
  check(th.length === 1 && th[0].nw > 200, '現場担当者画面: サンプル品目に参考写真のサムネイル ' + JSON.stringify(th));
  await page.screenshot({ path: OUT + '/1_customer_list.png', fullPage: true });
  await tap('tr.rowbtn[data-id="i1"]'); await page.waitForSelector('#ph .mainph img'); await tap('#close'); await tap('#logoutTop'); await tap('#logoutTop'); await page.waitForSelector('#g_form'); await page.fill('#g_code', 'S-004'); await page.fill('#g_pin', '4567'); await tap('#g_go'); await page.waitForSelector('tr.rowbtn');
  await tap('tr.rowbtn[data-id="i4"]'); await page.waitForSelector('#ph .mainph img');
  await page.waitForFunction(() => document.querySelector('#ph .mainph img').naturalWidth > 0 && document.querySelector('#ph .subs img').naturalWidth > 0);
  const det = await page.evaluate(() => ({ main: document.querySelectorAll('#ph .mainph img').length, subs: document.querySelectorAll('#ph .subs img').length, mainH: document.querySelector('#ph .mainph img').clientHeight, subH: document.querySelector('#ph .subs img').clientHeight, credit: (document.querySelector('.sheet .note a') || {}).textContent, noPicker: !document.querySelector('#addPick') }));
  check(det.main === 1 && det.subs === 1 && det.mainH > det.subH * 2 && /Wikimedia/.test(det.credit) && det.noPicker, '詳細: メイン写真(大)＋サブ写真(小窓)＋出典リンク、現場側は追加不可 ' + JSON.stringify(det));
  await page.screenshot({ path: OUT + '/2_customer_detail.png', fullPage: true });
  await tap('#ph .mainph img'); await page.waitForSelector('.lightbox img');
  await page.waitForFunction(() => document.querySelector('.lightbox img').naturalWidth >= 1000);
  const lb = await page.evaluate(() => ({ nw: document.querySelector('.lightbox img').naturalWidth, cap: document.querySelector('.lightbox .cap').textContent, del: !!document.querySelector('.lightbox .del') }));
  check(lb.nw >= 960 && /メイン写真/.test(lb.cap) && /写真: /.test(lb.cap) && !lb.del, '拡大: 参考写真の元サイズ表示＋出典、現場側に削除なし ' + JSON.stringify(lb));
  await page.screenshot({ path: OUT + '/3_customer_lightbox.png' });
  await tap('.lightbox .x');
  // "別の現場" keeps the code/PIN prefilled for autocomplete-style reuse
  await tap('#close');
  const lt = await page.evaluate(() => ({ visible: !document.querySelector('#logoutTop').hidden, right: Math.round(document.querySelector('#logoutTop').getBoundingClientRect().right), w: window.innerWidth, top: Math.round(document.querySelector('#logoutTop').getBoundingClientRect().top) }));
  check(lt.visible && lt.w - lt.right < 80 && lt.top < 60, '右上にログアウトボタン ' + JSON.stringify(lt));
  await tap('#logoutTop'); await page.waitForFunction(() => /もう一度/.test(document.querySelector('#logoutTop').textContent));
  await tap('#logoutTop'); await page.waitForSelector('#g_form');
  check(await page.evaluate(() => document.querySelector('#logoutTop').hidden), 'ログアウト（2回押し）→ ログイン画面ではボタン非表示');
  const pre = await page.evaluate(() => ({ c: document.querySelector('#g_code').value, p: document.querySelector('#g_pin').value, ac: document.querySelector('#g_pin').getAttribute('autocomplete'), form: !!document.querySelector('form#g_form') }));
  check(pre.c === 'S-004' && pre.p === '4567' && pre.ac === 'current-password' && pre.form, '現場ログイン: 前回のID/暗証番号が入力済み、ブラウザ保存用の form/autocomplete あり ' + JSON.stringify(pre));

  // ---- 2. seeding for a ledger created by v3 (sample items without photos) ----
  // the ledger is only written on the first save: log in, save settings, log out
  await tap('#toAdmin'); await page.waitForSelector('#a_form'); await page.fill('#a_pw', 'teito2026'); await tap('#a_go');
  await page.waitForSelector('#tabs:not([hidden])'); await tap('#tabs button[data-tab="settings"]'); await tap('#st_save');
  await page.waitForFunction(() => !!localStorage.getItem('tb_demo_v2')); await tap('#logoutA'); await page.waitForSelector('#g_form');
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('tb_demo_v2')); d.items.forEach(i => { if (/^i\d+$/.test(i.id)) i.photos = []; }); localStorage.setItem('tb_demo_v2', JSON.stringify(d)); localStorage.removeItem('tb_sample_photos_v4'); localStorage.removeItem('tb_sample_v6'); d.items.forEach(i => { if (i.id === 'i1') i.name = 'H形鋼 300×300 L=3m'; }); localStorage.setItem('tb_demo_v2', JSON.stringify(d)); });
  await page.reload(); await page.waitForSelector('#g_form');
  const seeded = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('tb_demo_v2')); return d.items.filter(i => /^i\d+$/.test(i.id) && i.photos.length >= 1 && /^jp_/.test(i.photos[0].id)).length + (d.items.find(i=>i.id==='i1').name.includes('単管') ? 0 : -100); });
  check(seeded === 10, `v3の台帳にも参考写真を一度だけ付与（${seeded}/10 品目）`);

  // ---- 3. admin: login form + remember on this device ----
  await tap('#toAdmin'); await page.waitForSelector('#a_form');
  const af = await page.evaluate(() => ({ user: document.querySelector('#a_user').getAttribute('autocomplete'), pw: document.querySelector('#a_pw').getAttribute('autocomplete'), keep: document.querySelector('#a_keep').checked }));
  check(af.user === 'username' && af.pw === 'current-password' && af.keep, '管理者ログイン: ID/パスワードの autocomplete 属性と「自動ログイン」初期ON ' + JSON.stringify(af));
  await page.fill('#a_pw', 'teito2026'); await page.keyboard.press('Enter');
  await page.waitForSelector('#tabs:not([hidden])');
  await page.reload(); await page.waitForSelector('#tabs:not([hidden])', { timeout: 10000 }).catch(() => {});
  check(!!(await page.$('#tabs:not([hidden])')), '再読み込み後も管理者のまま（この端末に記憶）');
  await page.screenshot({ path: OUT + '/4_admin_list.png', fullPage: true });

  // ---- 4. registration: 4 files of mixed formats → capped at 3, HEIC/TIFF decoded via vendored libs ----
  await tap('#tabs button[data-tab="in"]'); await page.waitForSelector('#f_pick');
  const pk = await page.evaluate(() => ({ cam: !!document.querySelector('#f_pick [data-cam]'), capture: document.querySelector('#f_pick [data-in-cam]').getAttribute('capture'), accept: document.querySelector('#f_pick [data-in-lib]').getAttribute('accept') }));
  check(pk.cam && pk.capture === 'environment' && /heic/.test(pk.accept) && /tiff/.test(pk.accept), 'カメラ撮影ボタン＋幅広い形式の accept ' + JSON.stringify(pk));
  await page.fill('#f_name', '形式テスト'); await page.fill('#f_manager', 'x');
  const t0 = toasts.length;
  await page.setInputFiles('#f_pick [data-in-lib]', ['f.heic', 'f.tif', 'f_alpha.png', 'f.webp'].map(f => path.join(__dirname, f)));
  await page.waitForFunction(() => document.querySelectorAll('#f_prev img').length === 3, {}, { timeout: 60000 });
  await page.waitForTimeout(300);
  const prev = await page.$$eval('#f_prev img', (els, fn) => els.map(eval(fn)), imgInfo.toString());
  const capToast = toasts.slice(t0).find(t => /3枚まで/.test(t));
  check(prev.length === 3 && prev[0].nw === 240 && prev[0].nh === 180 && prev[1].nw === 240 && prev[2].nw === 240 && !!capToast, `HEIC・TIFF・透過PNG を読み込み、4枚目は上限で断る ${JSON.stringify(prev)} / ${capToast}`);
  const libs = await page.evaluate(() => [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src')));
  check(libs.includes('lib/heic2any.min.js') && libs.includes('lib/UTIF.js'), '変換部品は必要になった時だけ読み込む ' + JSON.stringify(libs));
  // transparent PNG must not turn black: sample the stored thumb of photo #3 (white background expected at a corner)
  const corner = await page.evaluate(async () => { const im = document.querySelectorAll('#f_prev img')[2]; const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); const p = c.getContext('2d').getImageData(2, 2, 1, 1).data; return [p[0], p[1], p[2]]; });
  check(corner[0] > 240 && corner[1] > 240 && corner[2] > 240, '透過PNGの透明部分は黒ではなく白 ' + JSON.stringify(corner));
  await page.screenshot({ path: OUT + '/5_in_preview.png', fullPage: true });
  // make the 3rd pending photo the main one, then save
  await tap('#f_prev img:nth-of-type(3), #f_prev figure:nth-child(3) img');
  await page.waitForSelector('.lightbox .mn'); await tap('.lightbox .mn');
  await page.waitForFunction(() => /メイン/.test(document.querySelector('#f_prev figure:first-child figcaption').textContent) && document.querySelectorAll('#f_prev img').length === 3);
  await tap('#f_save'); await page.waitForSelector('#ph .mainph img');
  const saved = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('tb_demo_v2')); const it = d.items.find(i => i.name === '形式テスト'); return { n: it.photos.length, picker: !!document.querySelector('#addPick'), btnDisabled: document.querySelector('#addPick [data-lib]').disabled }; });
  check(saved.n === 3 && saved.picker && saved.btnDisabled, '3枚登録済みでは追加ボタンが無効 ' + JSON.stringify(saved));
  // delete a sub photo, then add via drag & drop (PC) -> picker active again
  await tap('#ph .subs img'); await page.waitForSelector('.lightbox .del:not(.mn)');
  await tap('.lightbox .del:not(.mn)'); await tap('.lightbox .del:not(.mn)');
  await page.waitForFunction(() => document.querySelectorAll('#ph .subs img').length === 1);
  const dt = await page.evaluateHandle(async b64 => { const dt = new DataTransfer(); const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); dt.items.add(new File([u8], 'drop.gif', { type: 'image/gif' })); return dt; }, fs.readFileSync(path.join(__dirname, 'f.gif')).toString('base64'));
  await page.dispatchEvent('#addPick', 'drop', { dataTransfer: dt });
  await page.waitForFunction(() => document.querySelectorAll('#ph .subs img').length === 2, {}, { timeout: 30000 });
  check(true, 'サブ写真の削除と、ドラッグ＆ドロップ（GIF）での追加');
  await page.screenshot({ path: OUT + '/6_item_detail.png', fullPage: true });

  // ---- 5. slip shows main photo large + credit for sample items ----
  await tap('#close'); await tap('tr.rowbtn[data-id="i8"]'); await page.waitForSelector('#slipIn');
  await page.evaluate(() => { window.open = () => null; });
  await tap('#slipIn'); await page.waitForSelector('#slipFrame'); await page.waitForTimeout(800);
  const frame = page.frames().find(f => f !== page.mainFrame());
  await frame.waitForSelector('.ph img.mainp', { timeout: 8000 }).catch(() => {});
  const sl = await frame.evaluate(() => ({ main: document.querySelectorAll('.ph img.mainp').length, sub: document.querySelectorAll('.ph img.subp').length, credit: /参考写真/.test(document.body.textContent), mainNW: (document.querySelector('.ph img.mainp')||{}).naturalWidth }));
  check(sl.main === 1 && sl.sub === 1 && sl.credit && sl.mainNW === 1280, '預かり証: メイン大・サブ小＋出典 ' + JSON.stringify(sl));
  await page.screenshot({ path: OUT + '/7_slip.png', fullPage: true });
  await tap('#close');

  // ---- 6. phone layout ----
  if (DEVICE === 'mobile') {
    const m = await page.evaluate(() => ({ tr: getComputedStyle(document.querySelector('tr.rowbtn')).display, thead: getComputedStyle(document.querySelector('table.cards thead')).display, inputFs: getComputedStyle(document.querySelector('#q')).fontSize, tabsWrap: getComputedStyle(document.querySelector('nav.tabs')).flexWrap, hscroll: document.documentElement.scrollWidth <= window.innerWidth + 1 }));
    check(m.tr === 'grid' && m.thead === 'none' && m.inputFs === '16px' && m.tabsWrap === 'wrap' && m.hscroll, 'スマホ: 一覧はカード表示・入力16px・タブ折返し・横スクロールなし ' + JSON.stringify(m));
    await page.screenshot({ path: OUT + '/8_phone_list.png', fullPage: true });
    await tap('#tabs button[data-tab="sites"]'); await page.waitForSelector('table.cards');
    await page.screenshot({ path: OUT + '/9_phone_sites.png', fullPage: true });
  }
  // logout clears the remembered password
  await tap('#logoutTop'); await tap('#logoutTop'); await page.waitForSelector('#g_form');
  await page.reload(); await page.waitForSelector('#g_form');
  check(!(await page.$('#tabs:not([hidden])')), 'ログアウト後は自動ログインしない');

  console.log('ERRORS:', errors.length ? errors : 'none');
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
  await browser.close(); server.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
