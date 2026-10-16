// 개발용: 카메라 허용(가짜 장치) / 거부 두 경우에 어떤 모드로 뜨는지 확인
import { chromium } from 'playwright-core';
const exe = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
for (const [name, args] of [
  ['allow', ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']],
  ['deny', ['--deny-permission-prompts']],
]) {
  const browser = await chromium.launch({ executablePath: exe, args });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.log(`[${name}] pageerror`, e.message));
  page.on('console', m => { if (m.type() !== 'debug' && !/DevTools|vite/.test(m.text())) console.log(`[${name}]`, m.type(), m.text().slice(0, 160)); });
  await page.goto('http://localhost:5317/');
  await page.waitForTimeout(8000);
  if (name === 'deny') { // 마우스를 움직여 그려지는지
    for (let i = 0; i < 120; i++) await page.mouse.move(640 + 300 * Math.sin(i / 8), 360 + 200 * Math.cos(i / 5), { steps: 2 });
    await page.waitForTimeout(500);
  }
  const r = await page.evaluate(() => [window.__gm.mode, window.__gm.poster.els.length, window.__gm.features.present]);
  console.log(`[${name}] mode=${r[0]} els=${r[1]} present=${r[2]}`);
  await browser.close();
}
