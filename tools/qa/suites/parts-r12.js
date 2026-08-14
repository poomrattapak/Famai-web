/* v1.12 — รวม อะไหล่ + เบิก/ขาย + ของแถม เป็นหน้าเดียว
   ด่านนี้พิสูจน์ว่าสิทธิ์แท็บอยู่ "ในฟังก์ชัน ptTab()" ไม่ใช่แค่ซ่อนปุ่ม */
const { chromium, EXE, BASE } = require('./env');

const ROLE_ID = { admin:'ST1', manager:'ST2', sales:'ST3', stock:'ST6', acct:'ST7', hr:'ST8', tech:'ST9' };
/* สิทธิ์เดิมก่อนรวมหน้า: อะไหล่ = admin/manager/stock/tech/acct
   เบิกขาย = admin/manager/stock/tech · ของแถม = admin/manager/stock/sales */
const WANT = {
  admin:   ['pt1','pt2','pt3'],
  manager: ['pt1','pt2','pt3'],
  stock:   ['pt1','pt2','pt3'],
  tech:    ['pt1','pt2'],
  acct:    ['pt1'],
  sales:   ['pt3'],
  hr:      []
};
const TBL = { pt1:'#pTable', pt2:'#msTable', pt3:'#gTable' };

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errs = [];

  for (const [role, id] of Object.entries(ROLE_ID)) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Bangkok' });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(`[${role}] ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/net::|status of 404/.test(m.text())) errs.push(`[${role}] console ${m.text()}`); });
    await p.goto(BASE + '/index.html');
    await p.click(`#lgUsers [data-id="${id}"]`);
    await p.click('#lgGo'); await p.waitForTimeout(450);

    const want = WANT[role];
    const inMenu = await p.evaluate(() => MENU.some(m => m.k === 'parts' && m.r.includes(ME.role)));
    if (inMenu !== (want.length > 0)) fails.push(`[${role}] parts อยู่ในเมนู = ${inMenu} ควรเป็น ${want.length > 0}`);

    if (!want.length) {
      const got = await p.evaluate(() => { go('parts'); return CUR; });
      if (got === 'parts') fails.push(`[${role}] เข้าหน้าอะไหล่ได้ทั้งที่ไม่มีสิทธิ์`);
      await ctx.close(); continue;
    }

    await p.evaluate(() => go('parts')); await p.waitForTimeout(350);
    if (await p.evaluate(() => CUR) !== 'parts') { fails.push(`[${role}] เข้าหน้าอะไหล่ไม่ได้`); await ctx.close(); continue; }

    /* 1 · ปุ่มแท็บที่วาดจริง ต้องตรงกับสิทธิ์เดิมเป๊ะ (แท็บเดียวไม่ต้องวาดปุ่ม) */
    const tabs = await p.$$eval('#ptTabs button', bs => bs.map(x => x.dataset.p));
    const expectBtns = want.length > 1 ? want : [];
    if (tabs.join(',') !== expectBtns.join(','))
      fails.push(`[${role}] ปุ่มแท็บ = [${tabs}] ควรเป็น [${expectBtns}]`);

    /* 2 · เปิดอยู่ได้ทีละแผ่นเดียว และต้องเป็นแผ่นที่มีสิทธิ์ */
    const on = await p.$$eval('#s-parts .pane.on', e => e.map(x => x.id));
    if (on.length !== 1) fails.push(`[${role}] แผ่นที่เปิดอยู่ ${on.length} แผ่น ควรเป็น 1`);
    if (on[0] !== want[0]) fails.push(`[${role}] เปิดแผ่น ${on[0]} ควรเป็น ${want[0]}`);

    /* 3 · ด่านอยู่ในฟังก์ชัน — เรียก ptTab() ตรง ๆ ด้วยแผ่นที่ไม่มีสิทธิ์ ต้องไม่เปิดให้ */
    for (const bad of ['pt1','pt2','pt3'].filter(x => want.indexOf(x) < 0)) {
      const opened = await p.evaluate(k => { ptTab(k);
        return [...document.querySelectorAll('#s-parts .pane.on')].map(x => x.id); }, bad);
      if (opened.indexOf(bad) >= 0) fails.push(`[${role}] ptTab('${bad}') เปิดแผ่นที่ไม่มีสิทธิ์ให้`);
      if (await p.evaluate(() => PT_SEL) === bad) fails.push(`[${role}] PT_SEL ค้างที่ ${bad}`);
    }

    /* 4 · ทุกแผ่นที่มีสิทธิ์ต้องมีข้อมูลจริง ไม่ใช่แผ่นเปล่า */
    for (const pane of want) {
      await p.evaluate(k => ptTab(k), pane); await p.waitForTimeout(150);
      const rows = await p.$$eval(TBL[pane] + ' .crow, ' + TBL[pane] + ' tbody tr', e => e.length).catch(() => 0);
      if (!rows) fails.push(`[${role}] แผ่น ${pane} (${TBL[pane]}) ไม่มีแถวเลย`);
      const vis = await p.isVisible(TBL[pane]);
      if (!vis) fails.push(`[${role}] แผ่น ${pane} เปิดแล้วแต่ ${TBL[pane]} มองไม่เห็น`);
    }

    /* 5 · สลับแท็บวน 3 รอบ ต้องไม่ล้น ไม่ลูป */
    await p.evaluate(() => { window.__r = 0; const o = render; render = function () { window.__r++; return o.apply(this, arguments); }; });
    for (let i = 0; i < 3; i++) for (const pane of want) {
      await p.evaluate(k => ptTab(k), pane);
      const over = await p.evaluate(() => document.body.scrollWidth - window.innerWidth);
      if (over > 1) fails.push(`[${role}] แผ่น ${pane} ล้นแนวนอน ${over}px`);
    }
    const rc = await p.evaluate(() => window.__r);
    if (rc > want.length * 3) fails.push(`[${role}] สลับแท็บ ${want.length * 3} ครั้ง แต่ render() ถูกเรียก ${rc} ครั้ง`);

    await ctx.close();
  }

  /* 6 · จำนวนหน้าในเมนู และตัวเลขแดงของหน้าอะไหล่ต้องรวมอะไหล่ต่ำ + ของแถมต่ำ
     v1.12 เหลือ 20 · v1.17 เพิ่ม "ดูแลหลังส่งมอบ" (บรีฟรอบ 1 ฝ่ายบริการ) = 21
     v1.20 เพิ่ม "ปรับแต่ง" (บรีฟรอบ 1 I2-I6 ต่อคน ทุกบทบาท) = 22 */
  {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Asia/Bangkok' });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(`[badge] ${e.message}`));
    await p.goto(BASE + '/index.html');
    await p.click('#lgGo'); await p.waitForTimeout(400);
    const n = await p.evaluate(() => MENU.filter(m => m.k).length);
    if (n !== 22) fails.push(`เมนูมี ${n} หน้า ควรเป็น 22`);
    const gone = await p.evaluate(() => MENU.filter(m => ['partsale','gift','follow','reg','fin','cust'].indexOf(m.k) >= 0).map(m => m.k));
    if (gone.length) fails.push(`ยังมีหน้าเก่าค้างในเมนู: ${gone}`);
    const bg = await p.evaluate(() => {
      const want = PARTS.filter(x => inScope(x.branch) && x.qty < x.min).length
                 + GIFTS.filter(x => inScope(x.branch) && x.qty < x.min).length;
      const el = document.querySelector('#bg-parts');
      return { want, got: el ? +el.textContent : 0 };
    });
    if (bg.want !== bg.got) fails.push(`ตัวเลขแดงหน้าอะไหล่ = ${bg.got} ควรเป็น ${bg.want} (อะไหล่ต่ำ + ของแถมต่ำ)`);
    await ctx.close();
  }

  console.log(fails.length ? 'FAILS:\n' + fails.join('\n') : 'ALL_CHECKS_PASS');
  console.log(errs.length ? 'ERRORS:\n' + [...new Set(errs)].join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})();
