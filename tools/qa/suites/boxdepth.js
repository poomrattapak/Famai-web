/* กฎ §9c "กล่องได้ใบเดียว" (คำสั่งถาวรจากเจ้าของ v1.7) — สร้างใหม่แทนตัวเดิมที่หายจากรีโป
   ระหว่างขอบจอกับตัวหนังสือ มี "ชั้นที่กินระยะด้านข้างหรือเป็นพื้นผิว" ได้ไม่เกิน 2
   (ปกติคือ .card พื้น+เงา กับ .bd ระยะขอบใน) — ตรวจทุกหน้า × 7 บทบาท ที่ 390px
   ปุ่ม ป้าย ชิป ช่องตาราง input ไม่นับ เพราะเป็นตัวเนื้อหาเอง ไม่ใช่ชั้นหุ้ม
   .tw / td.cwrap (กับดัก overflow ตั้งใจ) และ .doc (กระดาษเอกสาร) ยกเว้นตามที่ docs/04 ระบุ */
const { chromium, EXE, BASE } = require('./env');
const ROLES = { admin: 'ST1', manager: 'ST2', sales: 'ST3', stock: 'ST6', acct: 'ST7', hr: 'ST8', tech: 'ST9' };

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const fails = [];
  const errors = [];

  const SCAN = () => {
    const bad = [];
    const scr = document.querySelector('.screen.on'); if (!scr) return bad;
    const label = el => el.tagName.toLowerCase()
      + (el.id ? '#' + el.id : '')
      + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '');
    /* ตัวเนื้อหา — ไม่ใช่ชั้นหุ้ม จึงไม่เดินเข้าไปนับ
       .empty = ข้อความสถานะว่างที่ตัวมันเองคือเนื้อหา (ไม่มีพื้น มีแต่ระยะจัดกลาง)
       .ev    = แถวข้อมูลในปฏิทิน (ตัวหนังสือสี+จุด ไม่มีพื้น) — ชนิดเดียวกับ .pill/.cday */
    const CONTENT = 'button,a,td,th,select,input,textarea,label,svg,.pill,.chip,.cday,.doc,.docwrap,.si,.toast,.empty,.ev';
    const eats = el => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.position === 'fixed') return false;
      if (el.matches('.tw, td.cwrap')) return false;              /* กับดัก overflow ที่ตั้งใจวาง */
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const marX = parseFloat(cs.marginLeft) + parseFloat(cs.marginRight); /* ติดลบหักลบกันได้ */
      const sideEat = padX + marX > 4;
      const surfaced = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
      return sideEat || surfaced;
    };
    const walker = document.createTreeWalker(scr, NodeFilter.SHOW_TEXT, {
      acceptNode: n => n.textContent.trim().length >= 4
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
    const seen = new Set();
    let n;
    while ((n = walker.nextNode())) {
      const el = n.parentElement;
      if (!el || el.closest(CONTENT)) continue;
      if (el.offsetParent === null) continue;                     /* ซ่อนอยู่ ไม่มีผลกับตา */
      let depth = 0, cur = el, chain = [];
      while (cur && cur !== scr) {
        if (eats(cur)) { depth++; chain.push(label(cur)); }
        cur = cur.parentElement;
      }
      if (depth > 2) {
        const key = chain.join('>');
        if (!seen.has(key)) {
          seen.add(key);
          bad.push(`${depth} ชั้น [${chain.reverse().join(' > ')}] ที่ "${n.textContent.trim().slice(0, 28)}"`);
        }
      }
    }
    return bad;
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
      (await page.evaluate(SCAN)).forEach(b => fails.push(`[${role}] ${k}: ${b}`));

      const tabs = await page.$$('.screen.on .tabs button');
      for (let i = 0; i < tabs.length; i++) {
        const btns = await page.$$('.screen.on .tabs button');
        if (!btns[i]) break;
        await btns[i].click().catch(() => {});
        await page.waitForTimeout(120);
        (await page.evaluate(SCAN)).forEach(b => fails.push(`[${role}] ${k} tab#${i}: ${b}`));
      }
    }
    await page.close();
  }

  const uniq = [...new Set(fails)];
  console.log(uniq.length ? `FAILS (${uniq.length}):\n` + uniq.slice(0, 40).join('\n') : 'ALL_CHECKS_PASS');
  console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'NO_PAGE_ERRORS');
  await browser.close();
  process.exit(uniq.length || errors.length ? 1 : 0);
})();
