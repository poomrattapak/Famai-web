/* ด่านของค้นหารวม v1.26 ข้อ 4 — ค้นได้ทั้ง หน้า/แท็บ/ข้อมูล + zero-state ลดการพิมพ์
   กติกาสิทธิ์: รายการหน้าใน zero-state ต้องผ่าน canSee · หมวดข้อมูลมีด่านรายหมวด
   (role ที่เข้าหน้า stock ไม่ได้ ต้องค้นเลขเครื่องไม่เจอ) · แท็บ deep-link ผ่าน go(k,sub)
   ทุกข้อพิสูจน์ mutation แล้ว */
const { chromium, EXE, BASE } = require('./env');

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errs = [];
  const login = async (pg, id) => { await pg.goto(BASE + '/index.html');
    await pg.click('#lgUsers [data-id="' + id + '"]'); await pg.click('#lgGo'); await pg.waitForTimeout(500); };

  const p = await (await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1280, height: 900 } })).newPage();
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await login(p, 'ST3');                       /* ST3 = เซลล์ — เห็นบางหน้าเท่านั้น */

  /* 1 · zero-state: เปิดมามีรายการหน้า และทุกหน้าผ่าน canSee — หน้าเงินเดือนต้องไม่โผล่ให้เซลล์ */
  const t1 = await p.evaluate(() => {
    if (canSee('payroll')) return { skip: 'ST3 เห็น payroll ได้? — เลือกบทบาทผิด' };
    gsOpen();
    return { pages: GS_LIST.filter(x => x.kind === 'page').length,
      hasPayroll: GS_LIST.some(x => x.kind === 'page' && x.t === menuOf('payroll').t),
      headers: [...document.querySelectorAll('#gsR .gsh')].length };
  });
  if (t1.skip) fails.push('[1] ' + t1.skip);
  else {
    if (!t1.pages)     fails.push('[1] เปิดค้นหาแล้ว zero-state ไม่มีรายการหน้าเลย');
    if (t1.hasPayroll) fails.push('[1] เซลล์เห็นหน้า "เงินเดือน" ในรายการทั้งที่ canSee เป็น false');
    if (!t1.headers)   fails.push('[1] ไม่มีหัวกลุ่มผลค้นหา');
  }

  /* 4 · คีย์บอร์ด: ↓ เลือกรายการแรก Enter เปิด — ใช้คีย์จริงไม่ใช่ evaluate */
  await p.focus('#gsQ');
  await p.keyboard.press('ArrowDown'); await p.waitForTimeout(150);
  const sel = await p.evaluate(() => ({ sel: GS_SEL, on: !!document.querySelector('#gsR .gsi.on') }));
  if (sel.sel !== 0 || !sel.on) fails.push('[4] กด ↓ แล้วไม่เลือกรายการแรก (GS_SEL=' + sel.sel + ')');
  await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  const t4 = await p.evaluate(() => ({ closed: !$('#gs').classList.contains('on'), cur: CUR }));
  if (!t4.closed) fails.push('[4] กด Enter แล้วหน้าต่างค้นหาไม่ปิด/ไม่เปิดรายการ');

  /* 5 · ค้นชื่อลูกค้า → ต้องเปิดดีลของคนนั้น (กัน regression ของเดิม) */
  const t5 = await p.evaluate(() => {
    const c = CUSTOMERS.find(x => inScope(x.branch));
    if (!c) return null;
    gsOpen(); $('#gsQ').value = c.name.slice(0, 5); gsSearch();
    const hit = GS_LIST.find(x => (x.kind || 'data') === 'data' && x.t === c.name);
    if (!hit) return { found: false };
    hit.go();
    return { found: true, cur: CUR, sel: DEAL_SEL, want: c.id };
  });
  if (!t5 || !t5.found) fails.push('[5] ค้นชื่อลูกค้าแล้วไม่เจอในหมวดข้อมูล');
  else if (t5.cur !== 'deal' || t5.sel !== t5.want) fails.push('[5] กดผลลูกค้าแล้วไม่เปิดดีลของคนนั้น (CUR=' + t5.cur + ')');
  await p.context().close();

  /* 2 · ค้นแท็บแล้ว deep-link ถึงแท็บจริง — ผู้จัดการค้น "เงินเดือน" ต้องได้แท็บรายงานเงินเดือน */
  const p2 = await (await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1280, height: 900 } })).newPage();
  p2.on('pageerror', e => errs.push('PAGEERROR(ST2) ' + e.message));
  await login(p2, 'ST2');
  const t2 = await p2.evaluate(() => {
    gsOpen(); $('#gsQ').value = 'เงินเดือน'; gsSearch();
    const hit = GS_LIST.find(x => x.kind === 'tab' && x.t.indexOf('รายงานเงินเดือน') === 0);
    if (!hit) return { found: false, got: GS_LIST.map(x => x.t).slice(0, 5) };
    hit.go();
    return { found: true, cur: CUR, sel: RP_SEL,
      tabOn: !!document.querySelector('#rpTabs [data-rp="payroll"].on') };
  });
  if (!t2.found) fails.push('[2] ค้น "เงินเดือน" แล้วไม่เจอแท็บรายงานเงินเดือน — ได้: ' + JSON.stringify(t2.got));
  else {
    if (t2.cur !== 'report' || t2.sel !== 'payroll') fails.push('[2] กดผลแท็บแล้วไม่ถึงแท็บเงินเดือน (CUR=' + t2.cur + ' SEL=' + t2.sel + ')');
    if (!t2.tabOn) fails.push('[2] ถึงหน้ารายงานแต่แท็บเงินเดือนไม่ไฮไลต์');
  }
  await p2.context().close();

  /* 3 · หมวดข้อมูลเคารพสิทธิ์ — role ที่เข้าหน้า stock ไม่ได้ ค้นเลขเครื่องต้องไม่เจอรถ */
  const p3 = await (await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1280, height: 900 } })).newPage();
  p3.on('pageerror', e => errs.push('PAGEERROR(noStock) ' + e.message));
  let noStockId = null;
  for (const id of ['ST8', 'ST6', 'ST9', 'ST10', 'ST7']) {
    await login(p3, id);
    const ok = await p3.evaluate(() => !canSee('stock'));
    if (ok) { noStockId = id; break; }
  }
  if (!noStockId) fails.push('[3] หาบทบาทที่เข้าหน้า stock ไม่ได้ไม่เจอ — ด่านนี้ตรวจไม่ได้');
  else {
    const t3 = await p3.evaluate(() => {
      gsOpen(); $('#gsQ').value = UNITS[0].engine.slice(0, 8).toLowerCase(); gsSearch();
      return { bikes: GS_LIST.filter(x => (x.kind || 'data') === 'data').length };
    });
    if (t3.bikes) fails.push('[3] ' + noStockId + ' (ไม่มีสิทธิ์หน้า stock) ค้นเลขเครื่องแล้วเจอรถ ' + t3.bikes + ' รายการ');
  }
  await p3.context().close();

  /* 6 · 390: เปิดค้นหาแล้ว zero-state ใช้ได้ ไม่ทำจอล้น */
  const m = await (await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 390, height: 844 } })).newPage();
  m.on('pageerror', e => errs.push('PAGEERROR(390) ' + e.message));
  await login(m, 'ST2');
  await m.click('#gsBtn'); await m.waitForTimeout(300);
  const t6 = await m.evaluate(() => ({ rows: document.querySelectorAll('#gsR .gsi').length,
    sw: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) }));
  if (!t6.rows)     fails.push('[6] 390: เปิดค้นหาแล้วไม่มีรายการให้เลือก');
  if (t6.sw > 390)  fails.push('[6] 390: เปิดค้นหาแล้วจอกว้าง ' + t6.sw + 'px');
  await m.context().close();

  console.log(fails.length ? 'FAILS:\n' + fails.join('\n') : 'ALL_CHECKS_PASS');
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})();
