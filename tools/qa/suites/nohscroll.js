/* เกณฑ์รอบ 3: ที่ 390px ต้องไม่มีการเลื่อนซ้าย-ขวาที่ไหนเลย (ยกเว้น .doc = กระดาษ A4) */
const { chromium, EXE, BASE } = require('./env');
const ROLES = { admin: 'ST1', manager: 'ST2', sales: 'ST3', stock: 'ST6', acct: 'ST7', hr: 'ST8', tech: 'ST9', care: 'ST10' };

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const fails = [];
  const errors = [];

  const SCAN = () => {
    const bad = [];
    // "ปัดซ้าย-ขวาได้จริง" = element ที่ scroll แนวนอนได้ (auto/scroll) และเนื้อกว้างเกินกรอบ
    // ตัวที่ overflow:hidden (เช่น .cal .ev ที่ตั้งใจตัดด้วย …) ไม่นับ เพราะผู้ใช้ปัดไม่ได้
    const skip = e => e.closest('.doc') || e.matches('select,input,textarea,svg,use,option');
    document.querySelectorAll('#app *').forEach(e => {
      if (skip(e)) return;
      const ox = getComputedStyle(e).overflowX;
      if (ox !== 'auto' && ox !== 'scroll') return;
      if (e.scrollWidth > e.clientWidth + 1) {
        const sc = e.closest('.screen.on');
        bad.push(`${sc ? sc.id : '?'} ${e.tagName}${e.id ? '#' + e.id : ''}.${(e.className + '').split(' ')[0]} ${e.scrollWidth}>${e.clientWidth}`);
      }
    });
    return { body: document.body.scrollWidth, html: document.documentElement.scrollWidth, w: innerWidth, bad };
  };

  for (const [role, id] of Object.entries(ROLES)) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on('pageerror', e => errors.push(`[${role}] ${e.message}`));
    await page.goto(BASE + '/index.html');
    await page.click(`#lgUsers [data-id="${id}"]`);
    await page.click('#lgGo');
    await page.waitForTimeout(400);

    const screens = await page.evaluate(r => MENU.filter(m => m.k && m.r.indexOf(r) >= 0).map(m => m.k),
      await page.evaluate(() => ME.role));

    for (const k of screens) {
      await page.evaluate(kk => go(kk), k);
      await page.waitForTimeout(140);
      let r = await page.evaluate(SCAN);
      if (r.body > r.w) fails.push(`[${role}] ${k}: body ${r.body} > ${r.w}`);
      if (r.html > r.w) fails.push(`[${role}] ${k}: html ${r.html} > ${r.w}`);
      r.bad.forEach(b => fails.push(`[${role}] overflow: ${b}`));

      // เดินทุกแท็บย่อยในหน้านั้น แล้วสแกนซ้ำ
      const tabs = await page.$$('.screen.on .tabs button');
      for (let i = 0; i < tabs.length; i++) {
        const btns = await page.$$('.screen.on .tabs button');
        if (!btns[i]) break;
        await btns[i].click().catch(() => {});
        await page.waitForTimeout(140);
        r = await page.evaluate(SCAN);
        if (r.body > r.w) fails.push(`[${role}] ${k} tab#${i}: body ${r.body} > ${r.w}`);
        r.bad.forEach(b => fails.push(`[${role}] ${k} tab#${i} overflow: ${b}`));
      }

      // ชิปขั้นตอนคัมบัง (ถ้ามี)
      const chips = await page.$$('.screen.on .kchips .chip');
      for (let i = 0; i < chips.length; i++) {
        const cs = await page.$$('.screen.on .kchips .chip');
        if (!cs[i]) break;
        await cs[i].click().catch(() => {});
        await page.waitForTimeout(120);
        r = await page.evaluate(SCAN);
        r.bad.forEach(b => fails.push(`[${role}] ${k} kchip#${i} overflow: ${b}`));
      }
    }
    await page.close();
  }

  const uniq = [...new Set(fails)];
  console.log(uniq.length ? `FAILS (${uniq.length}):\n` + uniq.slice(0, 40).join('\n') : 'NO_HORIZONTAL_SCROLL_ANYWHERE');
  console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'NO_PAGE_ERRORS');
  await browser.close();
  process.exit(uniq.length || errors.length ? 1 : 0);
})();
