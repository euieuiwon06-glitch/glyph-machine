// 개발용: 가상 몸 모드에서 움직임 시작 직후 요소가 얼마나 빨리 생기는지, 정지 후 멈추는지 확인
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:5317/?sim=1&once');
let prev = 0;
for (const t of [300, 600, 900, 1200, 1500, 2000, 3000, 4000, 30000, 33000, 40000]) {
  await page.waitForTimeout(t - prev); prev = t;
  const r = await page.evaluate(() => [window.__gm.poster.els.length, window.__gm.features.energy.toFixed(2)]);
  console.log(`${t}ms els=${r[0]} energy=${r[1]}`);
}
await browser.close();
