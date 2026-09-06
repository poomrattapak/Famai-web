/* ภาพข้อมูลจำลองสำหรับตรวจหน้าจอโดยคน — ใช้คู่กับด่านพฤติกรรมทั้งหมด ไม่แทนผลด่าน */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { chromium, EXE, BASE } = require('./suites/env');

const OUT = path.join(process.env.QA_ARTIFACT_DIR || path.resolve(__dirname, '../../tmp/qa-ci'), 'screenshots');
const TARGETS = {
  ST1: ['deal', 'sell', 'quote', 'invoice', 'service', 'aftercare', 'users', 'settings'],
  ST3: ['deal', 'sell', 'quote'],
  ST7: ['deal', 'invoice'],
  ST10: ['service', 'aftercare']
};

/* สำรองภาพตรวจสำคัญใน log ของ GitHub เดิม เผื่อช่องทางดาวน์โหลด artifact ไม่พร้อม
   ทุกภาพมาจากข้อมูลจำลอง ไม่มีข้อมูลจาก API จริง และตรวจ digest ได้หลังประกอบกลับ */
async function logContactSheets(browser) {
  const groups = {
    'deal-mobile': ['ST1-deal-detail-390-light.png', 'ST1-deal-detail-390-dark.png'],
    'deal-desktop': ['ST1-deal-detail-1440-light.png', 'ST1-deal-detail-1440-dark.png'],
    permissions: ['ST1-settings-permissions-1440-light.png', 'ST1-settings-permissions-390-dark.png'],
    aftercare: ['ST10-aftercare-1440-dark.png', 'ST10-aftercare-390-light.png']
  };
  const page = await browser.newPage();
  try {
    for (const [name, files] of Object.entries(groups)) {
      const inputs = files.map(file => ({ file, data: fs.readFileSync(path.join(OUT, file)).toString('base64') }));
      const dataUrl = await page.evaluate(async sources => {
        const items = await Promise.all(sources.map(async source => {
          const image = new Image(); image.src = 'data:image/png;base64,' + source.data;
          await image.decode();
          const scale = image.width > 800 ? 2 / 3 : 1;
          return { ...source, image, width: Math.round(image.width * scale), height: Math.round(image.height * scale) };
        }));
        const canvas = document.createElement('canvas');
        canvas.width = items.reduce((sum, item) => sum + item.width, 0) + (items.length - 1) * 16;
        canvas.height = Math.max(...items.map(item => item.height)) + 36;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = '16px sans-serif'; ctx.fillStyle = '#111111';
        let x = 0;
        for (const item of items) {
          ctx.fillText(item.file, x + 8, 24);
          ctx.drawImage(item.image, x, 36, item.width, item.height); x += item.width + 16;
        }
        return canvas.toDataURL('image/png');
      }, inputs);
      const bytes = Buffer.from(dataUrl.split(',')[1], 'base64');
      const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      fs.writeFileSync(path.join(OUT, `sheet-${name}.png`), bytes);
      const chunks = bytes.toString('base64').match(/.{1,8192}/g);
      console.log('QA_VISUAL_SHEET_BEGIN ' + JSON.stringify({ name, bytes: bytes.length, chunks: chunks.length, sha256 }));
      chunks.forEach((chunk, index) => console.log(`QA_VISUAL_SHEET_CHUNK ${name} ${index} ${chunk}`));
      console.log(`QA_VISUAL_SHEET_END ${name}`);
    }
  } finally { await page.close(); }
}

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
          if (staff === 'ST1' && (screen === 'deal' || screen === 'settings')) {
            if (screen === 'deal') {
              await page.locator('#dlTable [data-deal]').first().click();
            } else {
              await page.locator('#cfTabs [data-p="cf7"]').click();
              /* แผงที่เพิ่งแสดงมี animation พร้อม delay ต้องรอเห็นเนื้อหาก่อนถ่าย */
              await page.waitForFunction(() => {
                const pane=document.querySelector('#cf7'), row=pane?.querySelector('[data-pmk]');
                return pane?.classList.contains('on')&&getComputedStyle(pane).opacity==='1'
                  &&row?.getBoundingClientRect().height>0;
              });
            }
            const detail = screen === 'deal' ? 'deal-detail' : 'settings-permissions';
            const detailName = `${staff}-${detail}-${width}-${theme}.png`;
            await page.screenshot({ path: path.join(OUT, detailName), fullPage: false, animations: 'disabled' });
            captured.push(detailName); console.log(detailName);
          }
        }
        await context.close();
      }
    }
    await logContactSheets(browser);
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ captured, errors }, null, 2));
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`บันทึกภาพ ${captured.length} ภาพ ครบ 1440/390 และสว่าง/มืด`);
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
