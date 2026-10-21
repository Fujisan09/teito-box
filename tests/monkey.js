// Monkey test: random clicks / typing / uploads / keys / reloads / back-button against the trial page.
// Fails on page errors, console errors, "エラー:" toasts, broken text (undefined/NaN), duplicate overlays, or a corrupt ledger.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = process.argv[2] || '/home/claude/teito-box';
const DEVICE = process.argv[3] || 'desktop';
const STEPS = +process.argv[4] || 600;
let seed = +process.argv[5] || 1;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = a => a[Math.floor(rnd() * a.length)];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); }); }).listen(0);
const FILES = ['land.jpg', 'port.jpg', 'f.heic', 'f.tif', 'f_alpha.png', 'f.webp', 'noisy.jpg', 'f.gif', 'sq.jpg'].map(f => path.join(__dirname, f));
fs.writeFileSync(path.join(__dirname, 'notimage.txt'), 'hello'); fs.writeFileSync(path.join(__dirname, 'broken.jpg'), Buffer.from('ffd8ffe000104a46494600', 'hex'));
const BAD = [path.join(__dirname, 'notimage.txt'), path.join(__dirname, 'broken.jpg')];
const TEXTS = ['', 'テスト', 'H形鋼 300×300', '<script>alert(1)</script>', '"><img src=x onerror=alert(1)>', '=1+1', '-5', '0', '1e5', '99999999', 'あ'.repeat(200), '😀🚚🏗️', 'S-001', 's-001', 'Ｓ－００１', '1234', '１２３４', '12', 'teito2026', 'admin', '  ', '2026-10-01', '2030-01-01', '1999-12-31', '3.5', '0.1', 'A-00001'];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(DEVICE === 'mobile'
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: rnd() < 0.5 ? 'dark' : 'light' }
    : { viewport: { width: 1280, height: 900 }, colorScheme: rnd() < 0.5 ? 'dark' : 'light' });
  const page = await ctx.newPage();
  if (process.env.UI) await page.addInitScript(u => { try { localStorage.setItem('tb_ui', u) } catch (e) {} }, process.env.UI);
  ctx.on('page', p => { trace.push('popup'); p.close().catch(() => {}); });
  const problems = [], trace = [];
  const report = (kind, msg) => { problems.push(`${kind}: ${msg} @step ${trace.length} (${trace.slice(-4).join(' | ')})`); };
  page.on('pageerror', e => report('pageerror', e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|fonts\.googleapis|favicon|net::ERR_|404/.test(m.text())) report('console', m.text()); });
  page.on('dialog', d => { trace.push('dialog:' + d.message().slice(0, 20)); rnd() < 0.7 ? d.accept() : d.dismiss(); });
  await page.exposeFunction('__toast', t => { if (/^エラー|失敗/.test(t) && !/読み込めませんでした|画像ファイルではありません|この形式|ログインし直して/.test(t)) report('toast', t); });
  await page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.classList && n.classList.contains('toast')) window.__toast(n.textContent); }))).observe(document.documentElement, { childList: true, subtree: true })); });
  const url = `http://localhost:${server.address().port}/?v=5`;
  await page.goto(url); await page.waitForSelector('#g_form');

  const check = async () => {
    const r = await page.evaluate(() => {
      const out = [];
      const txt = document.body.innerText;
      for (const bad of ['undefined', 'NaN', '[object ', 'null']) { const i = txt.indexOf(bad); if (i >= 0 && !/^(null|undefined)$/.test((document.activeElement && document.activeElement.value) || '')) { const ctx = txt.slice(Math.max(0, i - 25), i + 25).replace(/\s+/g, ' '); if (!/(null|undefined)/.test(ctx.slice(0, 25).replace(/.*\s/, '')) || true) out.push(`text "${bad}" near: ${ctx}`); } }
      if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 && !document.querySelector('.sheet')) out.push('horizontal overflow ' + document.documentElement.scrollWidth);
      { const nav = document.querySelector('#tabs'); if (nav && getComputedStyle(nav).position === 'fixed' && !nav.hidden && !document.querySelector('.sheet,.lightbox')) { const btns = [...document.querySelectorAll('main button, main tr.rowbtn')]; const last = btns[btns.length - 1]; if (last) { const nb = nav.getBoundingClientRect(); const maxY = document.documentElement.scrollHeight - innerHeight; const lr = last.getBoundingClientRect(); const bottomAtMax = lr.bottom - (maxY - scrollY); if (bottomAtMax > nb.top + 1) out.push('last control hidden under tab bar ' + Math.round(bottomAtMax) + '>' + Math.round(nb.top)); } } }
      if (document.querySelectorAll('.lightbox').length > 1) out.push('duplicate lightbox');
      if (document.querySelectorAll('.sheet').length > 1) out.push('duplicate sheet');
      if (!document.querySelector('#main') || !document.querySelector('#main').innerHTML.trim()) out.push('main empty');
      try { const s = localStorage.getItem('tb_demo_v2'); if (s) { const d = JSON.parse(s); for (const it of d.items) { if (!it.id || !it.no || !Number.isFinite(it.qty) || !Number.isFinite(it.area) || (it.photos || []).length > 3 || it.qty < 0) out.push('bad item ' + JSON.stringify(it).slice(0, 100)); } for (const st of d.sites) { if (!st.id || !st.code) out.push('bad site ' + JSON.stringify(st).slice(0, 80)); } const codes = d.sites.map(s => s.code.toUpperCase()); if (new Set(codes).size !== codes.length) out.push('duplicate site codes ' + codes.join(',')); } } catch (e) { out.push('ledger unparsable: ' + e.message); }
      return out;
    });
    r.forEach(x => report('invariant', x));
  };

  for (let step = 0; step < STEPS; step++) {
    let r = rnd();
    try {
      if ((await page.$('#a_form, #g_form')) && rnd() < 0.6) r = 0.43; // login now
      if (r >= 0.46) { const lo = await page.$('#logoutTop:not([hidden])'); if (lo && rnd() < 0.9) r = 0.47; }
      if (r < 0.04) { trace.push('reload'); await page.reload(); await page.waitForSelector('#main', { timeout: 10000 }); if (!page.url().startsWith(url.split('/?')[0])) { await page.goto(url); } }
      else if (r < 0.07) { trace.push('back'); await page.goBack({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(150); if (!page.url().startsWith(url.split('/?')[0])) { trace.push('left-site→return'); await page.goto(url); await page.waitForSelector('#main'); } }
      else if (r < 0.12) { const k = pick(['Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'Tab', 'Escape']); trace.push('key:' + k); await page.keyboard.press(k); }
      else if (r < 0.30) {
        // type into a random visible text field
        const inputs = await page.$$('input:visible:not([type=file]):not([type=checkbox]):not([type=submit]), textarea:visible');
        if (inputs.length) { const el = pick(inputs); const t = pick(TEXTS); const type = await el.getAttribute('type'); trace.push(`type[${type}]:${t.slice(0, 12)}`);
          if (type === 'date' || type === 'month' || type === 'number') await el.evaluate((e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, type === 'date' ? pick(['2026-10-01', '2030-01-01', '1999-12-31', '']) : type === 'month' ? pick(['2026-10', '2025-01', '']) : pick(['1', '0', '-5', '3.5', '999999', ''])).catch(() => {});
          else await el.fill(t, { timeout: 1500 }).catch(() => {});
          if (rnd() < 0.3) await page.keyboard.press('Enter'); }
      }
      else if (r < 0.37) {
        const files = await page.$$('input[type=file]');
        if (files.length) { const el = pick(files); const n = pick([1, 1, 2, 4]); const fs_ = []; for (let i = 0; i < n; i++) fs_.push(rnd() < 0.12 ? pick(BAD) : pick(FILES)); trace.push('upload:' + fs_.map(f => path.basename(f)).join(',')); await el.setInputFiles(fs_); await page.waitForTimeout(600); }
      }
      else if (r < 0.42) {
        const sels = await page.$$('select:visible');
        if (sels.length) { const el = pick(sels); const opts = await el.$$eval('option', os => os.map(o => o.value)); if (opts.length) { const v = pick(opts); trace.push('select:' + v.slice(0, 10)); await el.selectOption(v).catch(() => {}); } }
      }
      else if (r < 0.46) {
        // smart login so both roles get exercised
        if (await page.$('#a_form')) { trace.push('login:admin'); await page.fill('#a_pw', rnd() < 0.9 ? 'teito2026' : 'wrong'); await page.click('#a_go', { force: true }); await page.waitForTimeout(500); }
        else if (await page.$('#g_form') && rnd() < 0.6) { trace.push('toAdmin'); await page.click('#toAdmin', { force: true }); }
        else if (await page.$('#g_form')) { trace.push('login:site'); await page.fill('#g_code', pick(['S-001', 's-002', 'Ｓ－００３', 'S-999'])); await page.fill('#g_pin', pick(['1234', '2345', '３４５６', '0000'])); await page.click('#g_go', { force: true }); await page.waitForTimeout(400); }
        else if (rnd() < 0.3) { trace.push('wheel'); await page.mouse.wheel(0, pick([-300, 300])); }
      }
      else {
        let els = await page.$$('button:visible:not([disabled]):not(#logoutTop), a:visible:not([target=_blank]), tr.rowbtn, #ph img, #f_prev img, img.thumb, [data-site], [data-go], .jpmap, label.chk, .lightbox img, #sheetBg');
        if (rnd() < 0.03) els = els.concat(await page.$$('#logoutTop:visible, a[target=_blank]:visible'));
        if (els.length) { const el = pick(els); const desc = await el.evaluate(e => (e.id || e.className || e.tagName) + ':' + (e.textContent || '').trim().slice(0, 10)); trace.push('click:' + desc);
          if (rnd() < 0.15 && await page.$('.lightbox img')) { await el.dblclick({ force: true, timeout: 1500 }).catch(() => {}); }
          else await el.click({ force: true, timeout: 1500 }).catch(() => {}); }
      }
    } catch (e) { trace.push('err:' + e.message.slice(0, 40)); }
    await page.waitForTimeout(60 + rnd() * 120);
    if (step % 5 === 0) await check();
    if (problems.length > 25) break;
  }
  await check();
  const state = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('tb_demo_v2') || '{}'); return { items: (d.items || []).length, sites: (d.sites || []).length, moves: (d.moves || []).length }; }).catch(() => ({}));
  console.log(`${DEVICE} seed=${process.argv[5] || 1} steps=${STEPS} ledger=${JSON.stringify(state)} problems=${problems.length}`);
  problems.slice(0, 25).forEach(p => console.log('  ' + p));
  fs.writeFileSync(path.join(__dirname, `monkey_trace_${DEVICE}_${process.argv[5] || 1}.txt`), trace.join('\n'));
  await browser.close(); server.close();
  process.exit(problems.length ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
