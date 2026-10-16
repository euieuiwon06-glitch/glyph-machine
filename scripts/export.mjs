// 개발용: 가상 몸으로 일정 시간 생성한 뒤 S 키와 같은 4K 내보내기 결과를 파일로 받는다
// node scripts/export.mjs "<query>" out.png waitMs
import { chromium } from 'playwright-core';
import { writeFile } from 'node:fs/promises';
const [query = '?sim=6', out = 'export.png', wait = '30000'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:5317/${query}`);
await page.waitForTimeout(+wait);
await page.keyboard.press('Space'); // 일시정지 후 저장
const { url, w, h, stats } = await page.evaluate(async () => {
  const b = await window.__gm.poster.exportPNG(2);
  const bmp = await createImageBitmap(b);
  const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
  return { url, w: bmp.width, h: bmp.height, stats: window.__gm.composer.stats() };
});
await writeFile(out, Buffer.from(url.split(',')[1], 'base64'));
console.log(`saved ${w}x${h}`, JSON.stringify(stats));
await browser.close();
