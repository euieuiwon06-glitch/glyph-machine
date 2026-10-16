// 개발용: 가상 몸으로 완성될 때까지 돌린 뒤 자동 정지·SVG 버튼·SVG 내려받기를 확인한다
// node scripts/svgcheck.mjs <출력 폴더>
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
const out = process.argv[2] || '.';
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const p = await b.newPage({ viewport: { width: 1600, height: 900 }, acceptDownloads: true });
p.on('pageerror', e => console.log('pageerror', e.message));
await p.goto('http://localhost:5317/?sim=8');
const t0 = Date.now();
await p.waitForFunction(() => window.__gm.composer.done, null, { timeout: 120000, polling: 500 });
console.log('done after', ((Date.now() - t0) / 1000).toFixed(1), 's', JSON.stringify(await p.evaluate(() => window.__gm.composer.stats())));
const n1 = await p.evaluate(() => window.__gm.poster.els.length);
await p.waitForTimeout(2500);
const n2 = await p.evaluate(() => window.__gm.poster.els.length);
console.log('els after done', n1, '→ 2.5s later', n2);
await p.waitForTimeout(600);
await p.screenshot({ path: `${out}/done.png` });
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('.gm-svg')]);
const path = `${out}/${dl.suggestedFilename()}`;
await dl.saveAs(path);
const svg = await readFile(path, 'utf8');
console.log('svg', dl.suggestedFilename(), (svg.length / 1024).toFixed(0) + 'KB', 'has button:', svg.includes('gm-svg'));
const v = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await v.setContent(`<body style="margin:0">${svg.replace(/^<\?xml[^>]*>/, '').replace(/width="3840" height="2160"/, 'width="1920" height="1080"')}</body>`);
await v.screenshot({ path: `${out}/svg-render.png` });
await b.close();
