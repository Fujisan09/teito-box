// v5 checks: fee consistency, input normalization/validation, qty edit, backup/restore/reset, invite + QR auto-login,
// back-button layers, zoom, unsaved guard, search focus, CSV guard, version label, error toasts.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = process.argv[2] || '/home/claude/teito-box';
const OUT = process.argv[3] || __dirname + '/shots_v5x';
const DEVICE = process.argv[4] || 'desktop';
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); }); }).listen(0);
const fails = [];
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails.push(msg); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(DEVICE === 'mobile'
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1280, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  const page = await ctx.newPage();
  const errors = [], toasts = [], dialogs = [];
  let dialogAction = 'accept';
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|fonts\.googleapis/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('dialog', d => { dialogs.push(d.message()); dialogAction === 'accept' ? d.accept() : d.dismiss(); });
  await page.exposeFunction('__toast', t => toasts.push(t));
  await page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.classList && n.classList.contains('toast')) window.__toast(n.textContent); }))).observe(document.documentElement, { childList: true, subtree: true })); });
  const base = `http://localhost:${server.address().port}/`;
  const url = base + '?v=5';
  const tap = async sel => { if (DEVICE === 'mobile') { await page.waitForSelector(sel); await page.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), sel); await page.waitForTimeout(120); await page.click(sel, { force: true }); } else await page.click(sel); };
  const lastToast = () => toasts[toasts.length - 1] || '';

  // ---- 1. QR / invitation link opens the site view directly and hides the PIN from the address bar ----
  await page.goto(base + '?site=%EF%BD%93-001&pin=%EF%BC%91%EF%BC%92%EF%BC%93%EF%BC%94'); // full-width "ｓ-001" / "１２３４"
  await page.waitForSelector('tr.rowbtn');
  check(/S-001|北千住/.test(await page.textContent('#modeBadge')) && !/pin=/.test(page.url()), '案内リンク（全角コード/暗証番号）で現場画面が開き、URLから暗証番号が消える: ' + page.url());
  check(await page.$eval('.brand small .ver', e => /お試し版 v5/.test(e.textContent) && getComputedStyle(e).display !== 'none'), 'バージョン表記 v5 が表示（スマホでも）');
  // Back-button layers: item sheet → photo → Back closes photo → Back closes sheet
  await tap('tr.rowbtn[data-id="i1"]'); await page.waitForSelector('#ph .mainph img');
  await tap('#ph .mainph img'); await page.waitForSelector('.lightbox');
  await page.goBack(); await page.waitForTimeout(300);
  check(!(await page.$('.lightbox')) && !!(await page.$('#ph')), '戻るボタン1回目: 写真だけ閉じて詳細は残る');
  await page.goBack(); await page.waitForTimeout(300);
  check(!(await page.$('#ph')) && !!(await page.$('tr.rowbtn')) && page.url().startsWith(base), '戻るボタン2回目: 詳細が閉じ、ページには留まる');
  // ✕ close keeps history in step: open sheet, close via button, then goBack should leave the site? (it goes to the previous real entry) — we only assert no stray overlay reappears
  await tap('tr.rowbtn[data-id="i1"]'); await page.waitForSelector('#ph'); await tap('#close'); await page.waitForTimeout(200);
  check(!(await page.$('#ph')), '閉じるボタンでも閉じる');
  // zoom
  await tap('tr.rowbtn[data-id="i1"]'); await page.waitForSelector('#ph .mainph img'); await tap('#ph .mainph img'); await page.waitForSelector('.lightbox img');
  await page.waitForFunction(() => document.querySelector('.lightbox img').naturalWidth >= 1000);
  await page.dblclick('.lightbox img');
  const z1 = await page.$eval('.lightbox img', i => i.style.transform);
  await page.mouse.wheel(0, -200); await page.waitForTimeout(100);
  const z2 = await page.$eval('.lightbox img', i => i.style.transform);
  await page.dblclick('.lightbox img');
  const z3 = await page.$eval('.lightbox img', i => i.style.transform);
  check(/scale\(2\.5\)/.test(z1) && /scale\(3/.test(z2) && /scale\(1\)/.test(z3), `拡大: ダブルクリック→2.5倍、ホイール→拡大、再ダブルクリック→等倍 (${z1} / ${z2} / ${z3})`);
  await page.screenshot({ path: OUT + '/1_zoom.png' });
  await tap('.lightbox .x'); await tap('#close');
  await tap('#logoutTop'); await tap('#logoutTop'); await page.waitForSelector('#g_form');

  // ---- 2. admin: fee consistency ----
  await tap('#toAdmin'); await page.fill('#a_pw', 'teito2026'); await page.keyboard.press('Enter'); await page.waitForSelector('#tabs:not([hidden])');
  const fee = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('tb_demo_v2') || 'null'); return d; });
  // list shows i1 total; compute expected: daily, rate 200, area 9, in 2026-09-22 → today
  const expected = await page.evaluate(() => {
    const rate = 200, area = 9, inD = '2026-09-22'; const today = new Date(); const y = today.getFullYear(), m = today.getMonth() + 1, dd = today.getDate();
    let fee = 0; let cy = 2026, cm = 9;
    while (cy < y || (cy === y && cm <= m)) { const len = new Date(cy, cm, 0).getDate(); const start = (cy === 2026 && cm === 9) ? 22 : 1; const end = (cy === y && cm === m) ? dd : len; fee += area * rate * (end - start + 1) / len; cm++; if (cm > 12) { cm = 1; cy++; } }
    return Math.round(fee);
  });
  const shown = await page.$eval('tr.rowbtn[data-id="i1"] td:last-child', td => +td.textContent.replace(/[^\d]/g, ''));
  check(shown === expected, `保管料累計（日割り）が請求タブと同じ月別計算: 一覧 ¥${shown} = 期待 ¥${expected}`);
  await tap('#tabs button[data-tab="settings"]'); await page.selectOption('#st_bill', 'monthly'); await tap('#st_save'); await page.waitForFunction(() => /設定を保存/.test([...document.querySelectorAll('.toast')].map(t => t.textContent).join()));
  await tap('#tabs button[data-tab="stock"]'); await page.waitForSelector('tr.rowbtn[data-id="i1"]');
  const shownM = await page.$eval('tr.rowbtn[data-id="i1"] td:last-child', td => +td.textContent.replace(/[^\d]/g, ''));
  const monthsSpanned = await page.evaluate(() => { const t = new Date(); return (t.getFullYear() - 2026) * 12 + (t.getMonth() + 1) - 9 + 1; });
  check(shownM === 9 * 200 * monthsSpanned, `保管料累計（月単位）= 面積×単価×またいだ月数: ¥${shownM} (${monthsSpanned}か月)`);
  await tap('#tabs button[data-tab="settings"]'); await page.selectOption('#st_bill', 'daily'); await tap('#st_save'); await page.waitForTimeout(300);

  // ---- 3. search keeps the keyboard/focus; count shown ----
  await tap('#tabs button[data-tab="stock"]'); await page.waitForSelector('#q');
  await page.focus('#q'); await page.keyboard.type('H形鋼');
  const sr = await page.evaluate(() => ({ focused: document.activeElement && document.activeElement.id === 'q', rows: document.querySelectorAll('tr.rowbtn').length, count: document.querySelector('#stockCount').textContent }));
  check(sr.focused && sr.rows === 1 && sr.count === '1件', '検索: 入力欄のフォーカスを保ったまま絞り込み、件数表示 ' + JSON.stringify(sr));
  await page.fill('#q', '');

  // ---- 4. site editor: normalization, uniqueness, PIN rule, next code after deletion ----
  await tap('#tabs button[data-tab="sites"]'); await page.waitForSelector('[data-edit="s2"]');
  await tap('[data-edit="s2"]'); await page.waitForSelector('#s_code');
  await page.fill('#s_code', 's-001'); await tap('#s_save'); await page.waitForTimeout(200);
  check(/別の現場で使われています/.test(lastToast()), '重複する現場コード（小文字でも）は拒否: ' + lastToast());
  await page.fill('#s_code', 'ｓ－０２０'); await page.fill('#s_pin', '１２'); await tap('#s_save'); await page.waitForTimeout(200);
  check(/暗証番号は4/.test(lastToast()), '暗証番号2桁は拒否: ' + lastToast());
  await page.fill('#s_pin', '９８７６'); await tap('#s_save'); await page.waitForTimeout(300);
  const s2 = await page.evaluate(() => JSON.parse(localStorage.getItem('tb_demo_v2')).sites.find(s => s.id === 's2'));
  check(s2.code === 'S-020' && s2.pin === '9876', '全角入力は半角大文字に正規化して保存: ' + JSON.stringify({ code: s2.code, pin: s2.pin }));
  // invitation text
  await tap('[data-edit="s2"]'); await page.waitForSelector('#s_copy'); await tap('#s_copy'); await page.waitForTimeout(200);
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(/\?site=S-020&pin=9876/.test(clip) && /現場コード: S-020/.test(clip), '案内文コピー: 自動ログインURLとコード入り ' + clip.slice(0, 60).replace(/\n/g, ' '));
  await tap('#close');
  // delete s10 then add → next code is S-021 (max+1), not a duplicate
  await tap('[data-edit="s10"]'); await page.waitForSelector('#s_del'); await tap('#s_del'); await tap('#s_yes'); await page.waitForTimeout(300);
  await tap('#addSite'); await page.waitForSelector('#s_code');
  check((await page.inputValue('#s_code')) === 'S-021', '現場削除後の新規コードは最大値+1（S-021）: ' + await page.inputValue('#s_code'));
  await tap('#close');

  // ---- 5. item edit: qty/unit editable before any 出庫; 出庫 date validation ----
  await tap('#tabs button[data-tab="stock"]'); await page.waitForSelector('tr.rowbtn[data-id="i1"]'); await tap('tr.rowbtn[data-id="i1"]'); await page.waitForSelector('#e_qty');
  await page.fill('#e_qty', '30'); await page.fill('#e_unit', '束'); await tap('#e_save'); await page.waitForTimeout(300);
  const i1 = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('tb_demo_v2')); return { it: d.items.find(i => i.id === 'i1'), mv: d.moves.find(m => m.itemId === 'i1' && m.type === 'in') }; });
  check(i1.it.qty === 30 && i1.it.qtyIn === 30 && i1.it.unit === '束' && i1.mv.qty === 30, '数量・単位の編集が品目と入庫履歴に反映: ' + JSON.stringify({ q: i1.it.qty, u: i1.it.unit, mv: i1.mv.qty }));
  await page.fill('#o_date', '2026-09-01'); await page.fill('#o_qty', '5'); await tap('#o_go'); await page.waitForTimeout(200);
  check(/出庫日が受入日より前/.test(lastToast()), '受入日より前の出庫日は拒否: ' + lastToast());
  await page.fill('#o_date', '2026-10-15'); await tap('#o_go'); await page.waitForTimeout(400);
  check(!(await page.$('#e_qty')) && /一部出庫/.test(lastToast()), '一部出庫後は数量の編集欄が出ない: ' + lastToast());
  await tap('#close');

  // ---- 6. unsaved guard on 受入登録 ----
  await tap('#tabs button[data-tab="in"]'); await page.waitForSelector('#f_name'); await page.fill('#f_name', '途中');
  dialogAction = 'dismiss'; await tap('#tabs button[data-tab="stock"]'); await page.waitForTimeout(200);
  check(dialogs.length === 1 && !!(await page.$('#f_name')), '入力途中でタブ移動 → 確認ダイアログ、キャンセルで留まる');
  dialogAction = 'accept'; await tap('#tabs button[data-tab="stock"]'); await page.waitForSelector('#q');
  check(dialogs.length === 2 && !(await page.$('#f_name')), 'OKで移動');
  // qty 0 rejected
  await tap('#tabs button[data-tab="in"]'); await page.waitForSelector('#f_name'); await page.fill('#f_name', '数量ゼロ'); await page.fill('#f_manager', 'x'); await page.fill('#f_qty', '0'); await tap('#f_save'); await page.waitForTimeout(200);
  check(/数量は1以上/.test(lastToast()), '数量0は登録できない: ' + lastToast());
  await page.fill('#f_qty', '2'); await tap('#f_save'); await page.waitForSelector('#ph'); await tap('#close');

  // ---- 7. CSV formula guard ----
  await tap('#tabs button[data-tab="in"]'); await page.waitForSelector('#f_name'); await page.fill('#f_name', '=1+1'); await page.fill('#f_manager', '-x'); await tap('#f_save'); await page.waitForSelector('#ph'); await tap('#close');
  const dl = page.waitForEvent('download'); await tap('#csvBtn'); const d = await dl; const csvTxt = fs.readFileSync(await d.path(), 'utf8');
  check(/'=1\+1/.test(csvTxt) && /'-x/.test(csvTxt), 'CSV: 数式に見える値は \' を付けて無害化');

  // ---- 8. backup → reset → restore ----
  const dl2 = page.waitForEvent('download'); await tap('#tabs button[data-tab="settings"]'); await tap('#bk'); const bkFile = await (await dl2).path();
  const bk = JSON.parse(fs.readFileSync(bkFile, 'utf8'));
  check(Array.isArray(bk.items) && bk.items.length >= 12 && Array.isArray(bk.photos), `バックアップJSON: 品目 ${bk.items.length}件・写真 ${bk.photos.length}枚`);
  await tap('#resetBtn'); await tap('#resetYes'); await page.waitForTimeout(1500); await page.waitForSelector('#g_form');
  const afterReset = await page.evaluate(() => ({ ls: localStorage.getItem('tb_demo_v2'), keep: localStorage.getItem('tb_pw_keep') }));
  check(afterReset.ls === null && afterReset.keep === null, '初期化: 台帳とログイン記憶が消えてログイン画面に戻る');
  await tap('#toAdmin'); await page.fill('#a_pw', 'teito2026'); await page.keyboard.press('Enter'); await page.waitForSelector('#tabs:not([hidden])');
  await tap('#tabs button[data-tab="settings"]'); await page.waitForSelector('#rs', { state: 'attached' });
  await page.setInputFiles('#rs', bkFile); await page.waitForTimeout(1800); await page.waitForSelector('#tabs:not([hidden])');
  const restored = await page.evaluate(() => new Promise(res => { const d = JSON.parse(localStorage.getItem('tb_demo_v2')); const r = indexedDB.open('tb_demo_photos', 1); r.onsuccess = () => { const q = r.result.transaction('photos').objectStore('photos').count(); q.onsuccess = () => res({ items: d.items.length, idb: q.result }); }; }));
  check(restored.items === bk.items.length && restored.idb === bk.photos.length, `復元: 品目 ${restored.items}件・写真 ${restored.idb}枚が戻る`);

  // ---- 9. slip carries a QR for the site ----
  await tap('#tabs button[data-tab="stock"]'); await page.waitForSelector('tr.rowbtn[data-id="i7"]'); await tap('tr.rowbtn[data-id="i7"]'); await page.waitForSelector('#slipIn');
  await page.evaluate(() => { window.open = () => null; }); await tap('#slipIn'); await page.waitForSelector('#slipFrame'); await page.waitForTimeout(1000);
  const frame = page.frames().find(f => f !== page.mainFrame());
  const qr = await frame.evaluate(() => ({ svg: document.querySelectorAll('.qr svg').length, txt: document.querySelector('.qr') && document.querySelector('.qr').textContent }));
  check(qr.svg === 1 && /S-007/.test(qr.txt), '預かり証にQR（現場の自動ログインリンク）と現場コード: ' + (qr.txt || '').slice(0, 40));
  await page.screenshot({ path: OUT + '/2_slip_qr.png', fullPage: true });
  await tap('#close');

  // ---- 10. unhandled errors surface as a toast ----
  await page.evaluate(() => { Promise.reject(new Error('テスト用の失敗')); });
  await page.waitForTimeout(200);
  check(/エラー: テスト用の失敗/.test(lastToast()), '想定外の失敗はトーストで見える: ' + lastToast());

  console.log('ERRORS:', errors.length ? errors : 'none');
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
  await browser.close(); server.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
