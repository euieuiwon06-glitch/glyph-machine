// 개발용: 로컬 dev 서버 페이지를 Chrome 헤드리스로 열어 스크린샷을 찍는다.
// node scripts/shot.mjs "<query>" out.png [waitMs] [width] [height]
import { chromium } from 'playwright-core';

const [query = '', out = 'shot.png', wait = '1500', w = '1920', h = '1080'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('console', m => console.log('[page]', m.type(), m.text()));
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:5317/${query}`);
// wait에 '5000,15000,30000'처럼 여러 시점을 주면 out-1.png, out-2.png ...로 저장
const times = wait.split(',').map(Number);
let prev = 0;
for (const [i, t] of times.entries()) {
  await page.waitForTimeout(t - prev); prev = t;
  const path = times.length > 1 ? out.replace(/\.png$/, `-${i + 1}.png`) : out;
  await page.screenshot({ path });
  const st = await page.evaluate(() => window.__gm && { els: window.__gm.poster.els.length, ...window.__gm.composer.stats() }).catch(() => null);
  if (st) console.log(`[${t}ms]`, JSON.stringify(st));
}
await browser.close();
