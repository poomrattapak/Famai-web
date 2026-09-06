/* ภาพข้อมูลจำลองสำหรับตรวจหน้าจอโดยคน — ใช้คู่กับด่านพฤติกรรมทั้งหมด ไม่แทนผลด่าน */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium, EXE, BASE } = require('./suites/env');

const OUT = path.join(process.env.QA_ARTIFACT_DIR || path.resolve(__dirname, '../../tmp/qa-ci'), 'screenshots');
const TARGETS = {
  ST1: ['deal', 'sell', 'quote', 'invoice', 'service', 'aftercare', 'users', 'settings'],
  ST3: ['deal', 'sell', 'quote'],
  ST7: ['deal', 'invoice'],
  ST10: ['service', 'aftercare']
};

async function waitForServer() {
  for (let i = 0; i < 30; i++) {
    const up = await new Promise(resolve => {
      const request = http.get(BASE + '/index.html', response => {
        response.resume(); resolve(response.statusCode === 200);
      });
      request.on('error', () => resolve(false));
      request.setTimeout(1000, () => { request.destroy(); resolve(false); });
    });
    if (up) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('เซิร์ฟเวอร์สำหรับถ่ายภาพไม่พร้อม');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await waitForServer();
  const browser = await chromium.launch({ executablePath: EXE });
  const captured = [], errors = [];
  try {
    for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
      for (const [staff, screens] of Object.entries(TARGETS)) {
        const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, timezoneId: 'Asia/Bangkok' });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(`${staff}/${width}/${theme}: ${error.message}`));
        await page.goto(BASE + '/index.html');
        await page.click(`#lgUsers [data-id="${staff}"]`);
        await page.click('#lgGo');
        await page.waitForFunction(() => typeof ME !== 'undefined' && ME);
        await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
        for (const screen of screens) {
          await page.evaluate(value => { go(value); window.scrollTo(0, 0); }, screen);
          await page.waitForFunction(value => document.querySelector('.screen.on')?.id === 's-' + value, screen);
          await page.evaluate(() => document.fonts.ready);
          const name = `${staff}-${screen}-${width}-${theme}.png`;
          await page.screenshot({ path: path.join(OUT, name), fullPage: true, animations: 'disabled' });
          captured.push(name);
          console.log(name);
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ captured, errors }, null, 2));
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`บันทึกภาพ ${captured.length} ภาพ ครบ 1440/390 และสว่าง/มืด`);
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
