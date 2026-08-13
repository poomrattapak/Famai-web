/* กลุ่ม ③ ลูกค้า (บรีฟแก้ไขครั้งที่ 1) — ยิงที่ฟังก์ชันจริงตามกฎ §9b
   1) ส่งมอบรถ → งานฝ่ายบริการเกิดอัตโนมัติ: checklist + รอบติดตามตาม CFG.careDays จากวันส่งมอบ
   2) เซลล์เรียก careTick/careTask ตรง ๆ ต้องถูกปฏิเสธ · ฝ่ายบริการทำได้
   3) ลูกค้าเท (E1): ไม่กรอกรายละเอียด → ไม่ผ่าน · เทแล้ว รถกลับ available + ของแถมคืน
      + s.drop ครบ + เลขเอกสารคงอยู่ + งาน CARE ถูกลบ
   4) วันที่ใต้แถบขั้น (dealStepDates) มาจาก log จริง — ดีลส่งมอบแล้วมีวันที่ครบ
   5) signal ล่าช้า (E5): ไฟแนนซ์เงียบเกิน CFG.slaFin → d.slow · ปรับเกณฑ์สูง → หาย
   6) เรียงรายการล่าสุดขึ้นก่อนในกลุ่มปกติ */
const { chromium, EXE, BASE } = require('./env');

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const fails = [];
  const errs = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', e => errs.push(e.message));
  const login = async id => {
    await page.goto(BASE + '/index.html');
    await page.click(`#lgUsers [data-id="${id}"]`);
    await page.click('#lgGo');
    await page.waitForTimeout(350);
  };

  /* ---- 1) ส่งมอบ → CARE เกิด + รอบติดตามตรงวัน ---- */
  await login('ST1');
  const t1 = await page.evaluate(() => {
    /* หาดีลที่อยู่ขั้นป้ายขาว (พร้อมส่งมอบ) หรือดันให้ถึง */
    let rg = REGS.find(r => r.stage === 'ป้ายขาว');
    if (!rg) { rg = REGS.find(r => r.stage === 'รอทะเบียน');
      if (rg) { rg.plate = '1กก 9999'; rg.stage = 'ป้ายขาว'; } }
    if (!rg) return { skip: true };
    const before = CARE.length;
    regAdvance(rg.id);
    const s = SALES.find(x => x.id === rg.saleId);
    const cr = careOf(s.id);
    regAdvance(rg.id);                                   /* กดซ้ำต้องไม่สร้างซ้ำ */
    return { skip: false, created: CARE.length === before + 1 && !!cr,
      nTasks: cr ? cr.tasks.length : 0,
      days: cr ? cr.tasks.map(t => days(cr.createdAt, t.due)) : [],
      nCheck: cr ? cr.check.length : 0,
      dup: CARE.filter(x => x.saleId === s.id).length,
      sid: s.id };
  });
  if (t1.skip) fails.push('หาดีลให้ส่งมอบไม่ได้ — seed เปลี่ยน?');
  else {
    if (!t1.created) fails.push('ส่งมอบแล้ว CARE ไม่เกิด');
    if (t1.dup !== 1) fails.push('ส่งมอบซ้ำสร้างงานซ้ำ: ' + t1.dup);
    if (String(t1.days) !== '7,30,60,90,120') fails.push('รอบติดตามไม่ตรง 7/30/60/90/120 จากวันส่งมอบ: ' + t1.days);
    if (t1.nCheck < 3) fails.push('checklist ส่งมอบน้อยผิดปกติ: ' + t1.nCheck);
  }

  /* ---- 2) ด่านสิทธิ์ ---- */
  await login('ST3');                                    /* เซลล์ */
  const t2 = await page.evaluate(() => {
    const cr = CARE[0]; if (!cr) return { skip: true };
    const okTick = careTick(cr.id, 0);
    const okTask = careTask(cr.id, (cr.tasks.find(t => !t.done) || {}).id);
    return { skip: false, okTick, okTask,
      menu: MENU.find(m => m.k === 'aftercare').r.indexOf('sales') >= 0 };
  });
  if (!t2.skip) {
    if (t2.okTick || t2.okTask) fails.push('เซลล์ติ๊กงานฝ่ายบริการตรง ๆ ได้ — ด่าน §9b หลุด');
    if (t2.menu) fails.push('เซลล์เห็นเมนูฝ่ายบริการ — ควรเห็นเฉพาะในดีล');
  }
  await login('ST10');                                   /* ฝ่ายบริการ */
  const t2b = await page.evaluate(() => {
    const cr = CARE[0]; if (!cr) return { skip: true };
    const iv = cr.check.findIndex(c => !c.done);
    const okTick = iv >= 0 ? careTick(cr.id, iv) : true;
    const t = cr.tasks.find(x => !x.done);
    const okTask = t ? careTask(cr.id, t.id, 'ทดสอบ') : true;
    return { skip: false, okTick, okTask,
      by: iv >= 0 ? cr.check[iv].by : 'x',
      noteKept: t ? cr.tasks.find(x => x.id === t.id).note === 'ทดสอบ' : true };
  });
  if (!t2b.skip && (!t2b.okTick || !t2b.okTask)) fails.push('ฝ่ายบริการติ๊กงานของตัวเองไม่ได้');
  if (!t2b.skip && !t2b.noteKept) fails.push('บันทึกผลการติดต่อไม่ถูกเก็บ');

  /* ---- 3) ลูกค้าเท ---- */
  await login('ST1');
  const t3 = await page.evaluate(() => {
    /* ใช้ดีลขั้นทะเบียนที่ยังไม่ส่งมอบ */
    const rg = REGS.find(r => r.stage !== 'ส่งมอบแล้ว');
    if (!rg) return { skip: true };
    const s = SALES.find(x => x.id === rg.saleId);
    const u = UNITS.find(x => x.id === s.unitId);
    const g = (s.gifts || []).find(x => x && x.id);
    const gg = g && GIFTS.find(x => x.id === g.id);
    const gq = gg ? gg.qty : null;
    /* เลขเอกสารที่ออกไปแล้ว (ถ้ามี) ต้องอยู่ครบหลังเท — seed บางใบยังไม่เคยออกเลข */
    const docsBefore = JSON.stringify([s.docNo || null, s.docs || null]);
    custDropModal(s.id);
    /* ไม่กรอกรายละเอียด → กดบันทึกต้องไม่ผ่าน */
    $('#cdGo').onclick();
    const blockedNoDetail = !s.void;
    $('#cdDetail').value = 'ไปถึงหน้าบ้านแล้วลูกค้าเปลี่ยนใจ';
    if ($('#cdDown')) $('#cdDown').value = '1';
    $('#cdGo').onclick();
    /* ผ่าน confirmSave */
    const hadConfirm = !!$('#cfmGo') && $('#modal').classList.contains('on');
    if (hadConfirm) $('#cfmGo').onclick();
    return { skip: false, blockedNoDetail, hadConfirm,
      voided: s.void === true, unitBack: u.status === 'available',
      giftBack: gg ? GIFTS.find(x => x.id === g.id).qty === gq + g.qty : true,
      drop: s.drop || null,
      docKept: JSON.stringify([s.docNo || null, s.docs || null]) === docsBefore,
      careGone: !careOf(s.id) };
  });
  if (t3.skip) fails.push('หาดีลขั้นทะเบียนสำหรับทดสอบเทไม่ได้');
  else {
    if (!t3.blockedNoDetail) fails.push('เทได้โดยไม่กรอกรายละเอียด');
    if (!t3.hadConfirm) fails.push('เทไม่มี popup ยืนยัน');
    if (!t3.voided) fails.push('กดเทแล้วการขายไม่ถูกยกเลิก');
    if (!t3.unitBack) fails.push('เทแล้วรถไม่กลับเข้าสต๊อก');
    if (!t3.giftBack) fails.push('เทแล้วของแถมไม่คืนคลัง');
    if (!t3.drop || !t3.drop.reason || !t3.drop.detail || t3.drop.downBack !== true)
      fails.push('บันทึกเหตุผลเท/เงินดาวน์ไม่ครบ: ' + JSON.stringify(t3.drop));
    if (!t3.docKept) fails.push('เลขเอกสารหายหลังเท — ผิดกฎสรรพากร');
  }

  /* ---- 4) วันที่ใต้แถบขั้น + 5) signal ล่าช้า ---- */
  const t4 = await page.evaluate(() => {
    const done = CUSTOMERS.map(c => dealOf(c.id)).find(d => d && d.k === 'done');
    const finD = CUSTOMERS.map(c => dealOf(c.id)).find(d => d && d.k === 'fin' && !d.off && d.fc);
    const r = {};
    if (done) { const dt = dealStepDates(done);
      r.doneDates = dt.slice(1).every(Boolean);          /* lead อาจไม่มี createdAt ในข้อมูลสาธิตเก่า */
      r.doneLast = dt[dt.length - 1] === done.rg.deliveredAt; }
    if (finD) {
      const oldSla = CFG.slaFin;
      CFG.slaFin = 0;                                     /* เงียบเกิน 0 วัน = ช้าทันที */
      const slow = dealOf(finD.c.id).slow;
      CFG.slaFin = 9999;
      const notSlow = dealOf(finD.c.id).slow;
      CFG.slaFin = oldSla;
      r.slowOn = slow === true; r.slowOff = notSlow === false;
      /* จุดเหลืองต้องโผล่ในแถบจริง */
      CFG.slaFin = 0; DEAL_SEL = finD.c.id; rDealOne(finD.c.id);
      r.dotShown = !!document.querySelector('#dlOne .pn.slow');
      CFG.slaFin = oldSla;
    }
    return r;
  });
  if (t4.doneDates === false) fails.push('ดีลที่ส่งมอบแล้ววันที่ใต้ขั้นไม่ครบ');
  if (t4.doneLast === false) fails.push('วันที่ขั้นส่งมอบไม่ตรง deliveredAt');
  if (t4.slowOn === false) fails.push('ไฟแนนซ์เงียบเกินเกณฑ์แต่ d.slow ไม่ติด (E5)');
  if (t4.slowOff === false) fails.push('เกณฑ์สูงแล้ว slow ยังติด — ไม่ได้อ่าน CFG');
  if (t4.dotShown === false) fails.push('slow ติดแต่จุดเตือนไม่โผล่ในแถบขั้น');

  /* ---- 6) เรียงล่าสุดขึ้นก่อน ---- */
  const t6 = await page.evaluate(() => {
    go('deal');
    const rows = dealRows().filter(d => !d.off && !(d.late > 0) && !d.slow && d.k !== 'done' && d.s);
    const ds = rows.map(d => d.s.soldAt);
    return { sorted: ds.every((v, i) => i === 0 || ds[i - 1] >= v) };
  });
  if (!t6.sorted) fails.push('รายการกลุ่มปกติไม่ได้เรียงล่าสุดขึ้นก่อน');

  console.log(fails.length ? 'FAILS:\n' + fails.join('\n') : 'ALL_CHECKS_PASS');
  console.log(errs.length ? 'ERRORS:\n' + [...new Set(errs)].join('\n') : 'NO_PAGE_ERRORS');
  await browser.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})();
