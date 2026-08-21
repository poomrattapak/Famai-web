/* ด่านของปุ่ม "ยืนยัน" บนแถบบน v1.27.1 — คำสั่งเจ้าของ:
   "เปลี่ยนเป็นคำว่า ยืนยัน · ยืนยันตอนที่ต้องการให้เอาตัวเลือกทั้งสองไปใช้ ไม่ใช่ยืนยันปฏิทิน
    เมื่อกด จะกรองข้อมูลเป็นวันที่และสาขาที่เราเลือก"

   กติกาที่ด่านนี้ล็อกไว้:
   1 เลือกสาขาแล้วยังไม่กรอง (มีข้อความบอก)    4 หน้าที่มีสาขาอย่างเดียวก็ต้องกดยืนยัน
   2 กดยืนยันแล้วสาขาลงจริงและข้อมูลกรองตาม    5 ปิดแผ่นโดยไม่ยืนยัน = คืนสาขาเดิม
   3 เลือกทั้งวันที่+สาขา กดครั้งเดียวได้ทั้งคู่  6 ปุ่มเขียนว่า "ยืนยัน" และไม่มีปุ่มซ้อน · 7 ไม่มี error */
const { chromium, EXE, BASE } = require('./env');

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errs = [];
  const login = async (pg) => { await pg.goto(BASE + '/index.html');
    await pg.click('#lgUsers [data-id="ST1"]'); await pg.click('#lgGo'); await pg.waitForTimeout(600); };

  const p = await (await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } })).newPage();
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await login(p);

  /* 1 · เลือกสาขาบนแถบบน → ยังไม่กรอง แต่ต้องบอกด้วยข้อความว่ายังไม่ได้ใช้ */
  const t1 = await p.evaluate(() => {
    perSt('dash').r = 30; perSt('dash').from = ''; perSt('dash').to = ''; render();
    const sel = $('#navBrSel'), opt = [...sel.options].find(o => o.value);
    if (!opt) return null;
    const all = dUnits().length, kpi0 = $('#dKpis').textContent;
    sel.value = opt.value; sel.onchange();
    return { all, one: dUnits().length, page: $('#dBranch').value, want: opt.value,
      screenSame: $('#dKpis').textContent === kpi0,
      sum: $('#navSum').textContent, dot: !!$('#navSum i') && $('#navSum').classList.contains('on'),
      okOn: !$('#navOk').disabled };
  });
  if (!t1) fails.push('[1] แถบบนไม่มีตัวเลือกสาขาให้ทดสอบ');
  else {
    if (t1.page === t1.want) fails.push('[1] เลือกสาขาแล้วลงที่ #dBranch ทันที — ต้องรอกดยืนยัน');
    if (t1.one !== t1.all)   fails.push('[1] เลือกสาขาแล้วข้อมูลถูกกรองทันที (' + t1.all + ' → ' + t1.one + ')');
    if (!t1.screenSame)      fails.push('[1] เลือกสาขาแล้วจอวาดใหม่ทันที — ต้องรอกดยืนยัน');
    if (!/ยังไม่ได้ใช้/.test(t1.sum)) fails.push('[1] ไม่มีข้อความบอกว่าสาขายังไม่ได้ใช้: "' + t1.sum + '"');
    if (!t1.dot)             fails.push('[1] ไม่มีจุดสีคู่กับข้อความสถานะสาขา');
    if (!t1.okOn)            fails.push('[1] เลือกสาขาแล้วปุ่มยืนยันยังกดไม่ได้');
  }

  /* 2 · กดยืนยัน → สาขาลงจริง ข้อมูลกรองตาม ธงหมด ปุ่มกลับไป disabled */
  const t2 = await p.evaluate(() => {
    const all = dUnits().length;
    $('#navOk').click();
    return { all, one: dUnits().length, page: $('#dBranch').value,
      sum: $('#navSum').textContent.trim(), okOff: $('#navOk').disabled,
      lbl: $('#npLbl').textContent, want: scopeName($('#dBranch').value) };
  });
  if (t2.page === '')  fails.push('[2] กดยืนยันแล้ว #dBranch ยังว่าง — สาขาไม่ได้ลง');
  if (t2.one >= t2.all) fails.push('[2] กดยืนยันแล้วสต๊อกไม่ลด (' + t2.all + ' → ' + t2.one + ') — ไม่ได้กรองจริง');
  if (t2.sum)          fails.push('[2] ยืนยันแล้วยังมีข้อความ "ยังไม่ได้ใช้" ค้าง: "' + t2.sum + '"');
  if (!t2.okOff)       fails.push('[2] ยืนยันแล้วปุ่มยังกดได้ทั้งที่ไม่มีอะไรให้ใช้');
  /* v1.29: ระดับบริษัทป้ายเป็น "...ทุกสาขา" ได้ตามปกติ — ต้องเทียบว่าตรงกับที่เลือกจริง ไม่ใช่ค้นคำ */
  if (t2.want && t2.lbl.indexOf(t2.want) < 0)
    fails.push('[2] ป้ายปุ่มย่อไม่ตรงกับขอบเขตที่เลือก: "' + t2.lbl + '" ควรมี "' + t2.want + '"');

  /* 3 · เลือกทั้งช่วงเวลาและสาขา แล้วกดยืนยันครั้งเดียว → ต้องได้ทั้งคู่ในรอบเดียว */
  const t3 = await p.evaluate(() => {
    const sel = $('#navBrSel');
    sel.value = ''; sel.onchange(); $('#navOk').click();      /* ตั้งต้น: ทุกสาขา + 30 วัน */
    perSt('dash').r = 30; perSt('dash').from = ''; perSt('dash').to = ''; render();
    const from0 = dPeriod().from, all = dUnits().length;
    const opt = [...sel.options].find(o => o.value);
    if (!opt) return null;
    document.querySelector('#navPerBox [data-pr="1"]').click();   /* ช่วงเวลา: วันนี้ */
    sel.value = opt.value; sel.onchange();                        /* สาขา: สาขาแรก */
    $('#navOk').click();
    const n = dSales().length;
    return { perMoved: dPeriod().from !== from0, page: $('#dBranch').value, want: opt.value,
      brMoved: dUnits().length < all,
      match: $('#dKpis').textContent.replace(/\s/g, '').indexOf(n + 'คัน') >= 0,
      okOff: $('#navOk').disabled };
  });
  if (!t3) fails.push('[3] ไม่มีตัวเลือกสาขาให้ทดสอบพร้อมกับช่วงเวลา');
  else {
    if (!t3.perMoved)          fails.push('[3] กดยืนยันครั้งเดียวแล้วช่วงเวลาไม่เปลี่ยน');
    if (t3.page !== t3.want)   fails.push('[3] กดยืนยันครั้งเดียวแล้วสาขาไม่เปลี่ยน');
    if (!t3.brMoved)           fails.push('[3] กดยืนยันแล้วสต๊อกไม่ถูกกรองตามสาขา');
    if (!t3.match)             fails.push('[3] จอที่วาดใหม่ไม่ตรงกับ dSales() — ไม่ได้วาดด้วยค่าล่าสุดทั้งคู่');
    if (!t3.okOff)             fails.push('[3] ยืนยันแล้วปุ่มยังกดได้');
  }

  /* 4 · หน้าที่มีสาขาอย่างเดียว (ไม่มีช่วงเวลา) ต้องมีปุ่มยืนยันให้กดด้วย */
  const t4 = await p.evaluate(() => {
    go('stock');
    const perHidden = $('#navPerBox').style.display === 'none';
    const okThere = !!$('#navOk') && !!$('#navOk').offsetParent;
    const sel = $('#navBrSel'), opt = [...sel.options].find(o => o.value);
    if (!opt) return { perHidden, okThere, noOpt: true };
    const rows0 = document.querySelectorAll('#stBody tr, #stBody .rc').length;
    sel.value = opt.value; sel.onchange();
    const staged = $('#stBranch').value;
    $('#navOk').click();
    const r = { perHidden, okThere, staged, page: $('#stBranch').value, want: opt.value,
      rows0, rows: document.querySelectorAll('#stBody tr, #stBody .rc').length };
    sel.value = ''; sel.onchange(); $('#navOk').click();
    go('dash');
    return r;
  });
  if (!t4.perHidden) fails.push('[4] หน้าสต๊อกไม่มีช่วงเวลา แต่กล่องช่วงเวลายังโชว์');
  if (!t4.okThere)   fails.push('[4] หน้าที่มีสาขาอย่างเดียวไม่มีปุ่มยืนยันให้กด');
  else if (!t4.noOpt) {
    if (t4.staged === t4.want) fails.push('[4] สต๊อก: เลือกสาขาแล้วลง #stBranch ทันที — ต้องรอกดยืนยัน');
    if (t4.page !== t4.want)   fails.push('[4] สต๊อก: กดยืนยันแล้ว #stBranch ไม่เปลี่ยน');
    if (t4.rows0 && t4.rows >= t4.rows0)
      fails.push('[4] สต๊อก: กดยืนยันแล้วรายการไม่ลด (' + t4.rows0 + ' → ' + t4.rows + ')');
  }

  /* 6 · คำบนปุ่มต้องเป็น "ยืนยัน" ทุกที่ และห้ามมีปุ่มยืนยันซ้อนในกล่องช่วงเวลาบนแถบบน */
  const t6 = await p.evaluate(() => {
    go('sell'); goSub && goSub('sell', 'ws');
    const ws = document.querySelector('#wsPer [data-pok]');
    go('dash');
    return { nav: $('#navOk').textContent.trim(), ws: ws ? ws.textContent.trim() : null,
      dup: document.querySelectorAll('#navPerBox [data-pok]').length };
  });
  if (t6.nav !== 'ยืนยัน')  fails.push('[6] ปุ่มบนแถบบนเขียนว่า "' + t6.nav + '" ไม่ใช่ "ยืนยัน"');
  if (t6.ws && t6.ws !== 'ยืนยัน') fails.push('[6] ปุ่มของแถบช่วงเวลาในหน้าเขียนว่า "' + t6.ws + '"');
  if (t6.dup)              fails.push('[6] มีปุ่มยืนยันซ้อนอยู่ใน #navPerBox อีก ' + t6.dup + ' ปุ่ม');
  await p.context().close();

  /* 5 · มือถือ 390: เลือกสาขาในแผ่นแล้วปิดโดยไม่ยืนยัน → ต้องคืนค่าเดิมทั้งตัวเลือกและข้อมูล */
  const m = await (await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 390, height: 844 } })).newPage();
  m.on('pageerror', e => errs.push('PAGEERROR(390) ' + e.message));
  await login(m);
  await m.click('#npBtn'); await m.waitForTimeout(250);
  const pick = await m.evaluate(() => {
    const sel = $('#navBrSel'), opt = [...sel.options].find(o => o.value);
    if (!opt) return null;
    const all = dUnits().length;
    sel.value = opt.value; sel.onchange();
    return { all, want: opt.value, sum: $('#navSum').textContent };
  });
  if (!pick) fails.push('[5] 390: ไม่มีตัวเลือกสาขาในแผ่น');
  else {
    if (!/ยังไม่ได้ใช้/.test(pick.sum)) fails.push('[5] 390: เลือกสาขาแล้วไม่มีข้อความบอกว่ายังไม่ได้ใช้');
    /* ปิดด้วย Escape ไม่ใช่คลิกพื้นที่ว่าง — ที่ 390 จุดว่างเป็นแถบล่าง คลิกแล้วเปลี่ยนหน้า
       หน้าใหม่ render() → navBrSync() ล้างของค้างให้เอง ด่านจะมองไม่เห็นว่า "คืนค่า" ทำงานจริงไหม */
    await m.keyboard.press('Escape'); await m.waitForTimeout(300);
    const rev = await m.evaluate(() => ({ sel: $('#navBrSel').value, page: $('#dBranch').value,
      one: dUnits().length, open: $('#navCtl').classList.contains('on'), sum: $('#navSum').textContent.trim() }));
    if (rev.open)             fails.push('[5] 390: กดนอกแผ่นแล้วแผ่นไม่ปิด');
    if (rev.page === pick.want) fails.push('[5] 390: ปิดแผ่นโดยไม่ยืนยันแล้วสาขากลับลงที่หน้า');
    if (rev.sel !== '')       fails.push('[5] 390: ปิดแผ่นแล้วตัวเลือกสาขาไม่คืนค่าเดิม (ยังเป็น "' + rev.sel + '")');
    if (rev.one !== pick.all) fails.push('[5] 390: ปิดแผ่นโดยไม่ยืนยันแล้วข้อมูลถูกกรองไปแล้ว');
    if (rev.sum)              fails.push('[5] 390: ปิดแผ่นแล้วข้อความ "ยังไม่ได้ใช้" ยังค้าง');
  }
  const sw = await m.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth));
  if (sw > 390) fails.push('[5] 390: ปุ่มยืนยันบนแถบทำให้จอเลื่อนซ้าย-ขวาได้ (' + sw + 'px)');
  await m.context().close();

  console.log(fails.length ? 'FAILS:\n' + fails.join('\n') : 'ALL_CHECKS_PASS');
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})();
