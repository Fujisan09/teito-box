// Screenshot every screen in light + dark, desktop + phone, for a visual pass.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = '/home/claude/teito-box'; const UI = process.argv[2] || ''; const OUT = __dirname + '/shots_ui_' + (UI || 'std'); fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); }); }).listen(0);
(async () => {
  const browser = await chromium.launch();
  for (const device of ['desktop', 'mobile']) for (const scheme of (UI ? ['light'] : ['light', 'dark'])) {
    const ctx = await browser.newContext(device === 'mobile' ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme } : { viewport: { width: 1280, height: 900 }, colorScheme: scheme });
    const page = await ctx.newPage(); const tag = `${device}_${scheme}`;
    const shot = async name => { await page.waitForTimeout(500); return page.screenshot({ path: `${OUT}/${tag}_${name}.png`, fullPage: device === 'mobile' }); };
    const tap = async sel => { await page.waitForSelector(sel); await page.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), sel); await page.click(sel, { force: true }); };
    await page.goto(`http://localhost:${server.address().port}/` + (UI ? '?ui=' + UI : '')); await page.waitForSelector('#g_form'); await shot('1gate');
    await tap('#toAdmin'); await page.fill('#a_pw', 'teito2026'); await page.keyboard.press('Enter'); await page.waitForSelector('#tabs:not([hidden])');
    await page.waitForFunction(() => [...document.querySelectorAll('img.thumb')].every(i => i.complete)); await shot('2stock');
    await tap('tr.rowbtn[data-id="i1"]'); await page.waitForSelector('#ph .mainph img'); await page.waitForTimeout(300); await shot('3item');
    await tap('#ph .mainph img'); await page.waitForFunction(() => document.querySelector('.lightbox img').naturalWidth >= 1000); await shot('4lightbox'); await tap('.lightbox .x'); await tap('#close');
    await tap('#tabs button[data-tab="in"]'); await page.waitForSelector('#f_pick'); await shot('5in');
    await tap('#tabs button[data-tab="sites"]'); await page.waitForSelector('[data-edit]'); await shot('6sites');
    await tap('[data-edit="s1"]'); await page.waitForSelector('#s_code'); await shot('7siteedit'); await tap('#close');
    await tap('#tabs button[data-tab="map"]'); await page.waitForSelector('.jpmap'); await shot('8map');
    await tap('#tabs button[data-tab="bill"]'); await page.waitForSelector('#bm'); await shot('9bill');
    await tap('#tabs button[data-tab="settings"]'); await page.waitForSelector('#st_save'); await shot('10settings');
    await tap('#tabs button[data-tab="moves"]'); await page.waitForSelector('table'); await shot('11moves');
    await tap('#logoutTop'); await tap('#logoutTop'); await page.waitForSelector('#g_form');
    await page.fill('#g_code', 'S-001'); await page.fill('#g_pin', '1234'); await page.keyboard.press('Enter'); await page.waitForSelector('tr.rowbtn');
    await page.waitForFunction(() => [...document.querySelectorAll('img.thumb')].every(i => i.complete)); await shot('12customer');
    await ctx.close();
  }
  await browser.close(); server.close(); console.log('done');
})();
