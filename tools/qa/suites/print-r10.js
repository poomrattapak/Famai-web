/* ด่านของข้อ 8 — "Receipt print ให้ account manager print ได้เท่านั้น"
   ตีความตามที่เจ้าของยืนยัน: บัญชี + ผู้บริหาร (+ แอดมินซึ่งเป็นบัญชีเจ้าของร้านเอง)
   สิ่งที่ต้องพิสูจน์คือด่านอยู่ใน printCurrentDoc() ไม่ใช่แค่ซ่อนปุ่ม
   จึงเรียกฟังก์ชันตรง ๆ ด้วย แล้วดักว่า window.print ถูกเรียกจริงหรือไม่ */
const { chromium, EXE, BASE } = require('./env');
const ALLOWED = ['admin', 'manager', 'acct'];

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errors = [];
  const bad = m => fails.push(m);

  const ids = await (async () => {
    const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(BASE + '/index.html');
    const r = await p.$$eval('#lgUsers [data-id]', e => e.map(x => x.dataset.id));
    await ctx.close(); return r;
  })();

  const seen = new Set();
  for (const sid of ids) {
    const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(sid + ' PAGEERROR ' + e.message));
    await p.goto(BASE + '/index.html');
    await p.click('#lgUsers [data-id="' + sid + '"]');
    await p.click('#lgGo'); await p.waitForTimeout(400);
    const role = await p.evaluate(() => ME.role);
    if (seen.has(role)) { await ctx.close(); continue; }
    seen.add(role);
    const may = ALLOWED.indexOf(role) >= 0;

    /* ดักการพิมพ์จริง — printHTML() ยัด HTML ลง #printArea แล้วเรียก window.print()
       แทน window.print ด้วยตัวนับ จะได้รู้ว่าพิมพ์ออกไปจริงไหม ไม่ใช่แค่ดูว่าปุ่มโผล่ */
    await p.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });

    /* 1 · canPrintDoc() ต้องตรงกับกติกา */
    const flag = await p.evaluate(() => canPrintDoc());
    if (flag !== may) bad('[' + role + '] canPrintDoc()=' + flag + ' ควรเป็น ' + may);

    /* 2 · เรียก printCurrentDoc() ตรง ๆ โดยไม่ผ่านปุ่ม — ด่านต้องอยู่ในฟังก์ชัน */
    const printed = await p.evaluate(() => {
      const s = SALES.find(x => !x.void);
      if (!s) return null;
      DOC_SALE = s.id; DOC_SEL = 'RECEIPT';
      window.__printed = 0;
      printCurrentDoc();
      return window.__printed;
    });
    /* printHTML หน่วง 60ms ก่อนสั่งพิมพ์ ต้องรอให้ถึงก่อนอ่านตัวนับ */
    await p.waitForTimeout(250);
    const printedN = await p.evaluate(() => window.__printed);
    if (printed === null) bad('[' + role + '] ไม่มีการขายใน seed ให้ทดสอบ');
    else if (may && printedN < 1) bad('[' + role + '] มีสิทธิ์แต่พิมพ์ไม่ออก');
    else if (!may && printedN > 0) bad('[' + role + '] ไม่มีสิทธิ์แต่พิมพ์ออกได้ — ด่านไม่ได้อยู่ในฟังก์ชัน');

    /* 3 · ส่วนเอกสารบนหน้าดีลโผล่เฉพาะคนที่พิมพ์ได้ */
    if (await p.evaluate(() => canSee('deal'))) {
      await p.evaluate(() => { const d = dealAll().find(x => x.s && !x.s.void); if (d) dealGo(d.c.id); });
      await p.waitForTimeout(350);
      const hasDoc = await p.evaluate(() => !!document.querySelector('#dlPrint'));
      if (may && !hasDoc) bad('[' + role + '] มีสิทธิ์พิมพ์แต่หน้าดีลไม่มีส่วนเอกสาร');
      if (!may && hasDoc) bad('[' + role + '] ไม่มีสิทธิ์พิมพ์แต่หน้าดีลยังมีปุ่มพิมพ์');
    }

    /* 4 · แท็บเอกสารในหน้าขายรถต้องไม่มีแล้ว (ย้ายไปหน้าดีล)
       v1.18: ช่อง p3 ถูกใช้ใหม่เป็นแท็บขายส่ง (B2B) ตามบรีฟกลุ่ม ④ — สิ่งที่ห้ามกลับมาคือ
       "เอกสาร" จึงเช็คจากป้ายแท็บ ไม่ใช่ id ช่อง · แถมคุมว่าแท็บขายส่งโชว์ตรงสิทธิ์ act:wholesale */
    if (await p.evaluate(() => canSee('sell'))) {
      const t = await p.evaluate(() => { go('sell');
        return { labels: [...document.querySelectorAll('#sellTabs button')].map(b => b.textContent),
          wsShown: document.querySelector('#sellTabWs').style.display !== 'none',
          wsMay: canWholesale() }; });
      if (t.labels.some(x => x.includes('เอกสาร')))
        bad('[' + role + '] หน้าขายรถมีแท็บเอกสารกลับมา (ต้องอยู่หน้าดีลเท่านั้น)');
      if (t.wsShown !== t.wsMay)
        bad('[' + role + '] แท็บขายส่งโชว์ไม่ตรงสิทธิ์ (เห็น=' + t.wsShown + ' · สิทธิ์=' + t.wsMay + ')');
    }

    await ctx.close();
  }

  const missing = ALLOWED.filter(r => !seen.has(r));
  if (missing.length) bad('ไม่ได้ทดสอบบทบาท: ' + missing.join(', '));

  console.log(fails.length ? 'FAILS:\n' + [...new Set(fails)].join('\n') : 'ALL_CHECKS_PASS');
  console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})();
