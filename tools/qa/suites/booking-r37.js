/* ด่าน v1.37 — การจองรถ (บรีฟรอบ 2 ข้อ 2 + คำตอบเจ้าของข้อ 1-2 + B4)
   เจ้าของสั่ง: จอง = เก็บข้อมูลคร่าว ๆ ก่อนตัดสินใจ รถติด "จองแล้ว" กันขายทับ ·
   มัดจำเลือกได้ (วาง = ใบเสร็จ + คืนเมื่อยกเลิก) · ยกเลิกรถคืนสต๊อก · ไม่มีหมดอายุอัตโนมัติ
   ล็อก:
   [1] เมนู booking + หน้าวาดจริง · seed มีการจองสาธิตและรถติดสถานะจองจริง
   [2] ด่าน act:booking ในฟังก์ชันเขียน — role ต้องห้าม (care) เรียก bookSave/bookCancel
       ตรง ๆ ต้องถูกปฏิเสธ และไม่มีอะไรถูกเขียน
   [3] bookSave: ชื่อ+เบอร์+คันบังคับ · จองแล้วรถเป็น reserved + ลูกค้าถูกสร้าง/ผูก
       + มัดจำออกเลขใบเสร็จ · จองทับคันที่ติดจองแล้วไม่ได้
   [4] B4: จุดสีจองต่างจากขายแล้ว · ตัวกรอง "จองแล้ว" ในสต๊อกได้ผลจริง
   [5] ด่านใน saveSale: คนอื่นซื้อคันติดจองถูกกัน · ลูกค้าที่จองเปิดการขายได้ผ่าน
       bookOpenSale → การจองปิดเป็น "เปิดขายแล้ว" + รถ sold · เลขที่การขายเป็นซีรีส์ SALE
       และไม่จองเลขใบกำกับล่วงหน้า (v1.36)
   [6] ยกเลิก: เหตุผลบังคับ · ยกเลิกแล้วรถคืน available + บันทึกคืนมัดจำ
   [7] ดีลของลูกค้าที่มีจอง โชว์ป้าย "จองคันนี้อยู่" ในขั้นคุยกับลูกค้า */
const { chromium, EXE, BASE } = require('./env');

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errors = [];
  const bad = m => fails.push(m);
  const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  const login = async id => { await p.goto(BASE + '/index.html');
    await p.click('#lgUsers [data-id="' + id + '"]'); await p.click('#lgGo'); await p.waitForTimeout(450); };

  /* ---------- [1] โครงหน้า + seed ---------- */
  await login('ST1');
  const g1 = await p.evaluate(() => {
    go('booking');
    return { cur: CUR, menu: MENU.some(m => m.k === 'booking'),
      act: BOOKINGS.filter(x => x.status === 'จองอยู่').length,
      reserved: UNITS.filter(u => u.status === 'reserved').length,
      rows: document.querySelectorAll('#bkTable tbody tr').length,
      consistent: BOOKINGS.filter(x => x.status === 'จองอยู่')
        .every(x => (UNITS.find(u => u.id === x.unitId) || {}).status === 'reserved') };
  });
  if (g1.cur !== 'booking' || !g1.menu) bad('[1] เข้าหน้าจองรถไม่ได้');
  if (!g1.act || !g1.reserved) bad('[1] seed ไม่มีการจองสาธิต/รถติดจอง');
  if (g1.rows !== g1.act) bad('[1] ตารางจองวาด ' + g1.rows + ' แถว ควรเป็น ' + g1.act);
  if (!g1.consistent) bad('[1] มีการจองที่รถไม่ติดสถานะ reserved — สองระเบียนไม่ตรงกัน');

  /* ---------- [2] ด่าน act:booking ---------- */
  await login('ST10');                                   /* ฝ่ายบริการ — ไม่มีสิทธิ์จอง */
  const g2 = await p.evaluate(() => {
    const u = UNITS.find(x => x.status === 'available');
    $('#bkName').value = 'QA ห้ามจอง'; $('#bkPhone').value = '081-000-0000';
    $('#bkUnit').innerHTML = '<option value="' + u.id + '">x</option>'; $('#bkUnit').value = u.id;
    const n = BOOKINGS.length;
    const r1 = bookSave();
    const bk = BOOKINGS.find(x => x.status === 'จองอยู่');
    const r2 = bk ? bookCancel(bk.id, 'QA ลอง') : false;
    return { saveBlocked: r1 === false && BOOKINGS.length === n && u.status === 'available'
        && !$('#modal').classList.contains('on'),
      cancelBlocked: r2 === false && (!bk || bk.status === 'จองอยู่') };
  });
  if (!g2.saveBlocked) bad('[2] ฝ่ายบริการเรียก bookSave ตรง ๆ ได้ — ด่าน §9b หลุด');
  if (!g2.cancelBlocked) bad('[2] ฝ่ายบริการเรียก bookCancel ตรง ๆ ได้');

  /* ---------- [3] bookSave — ช่องบังคับ + ผลการเขียน ---------- */
  await login('ST3');                                    /* เซลล์ — จองได้ */
  const g3 = await p.evaluate(() => {
    go('booking');
    const n = BOOKINGS.length;
    $('#bkName').value = ''; $('#bkPhone').value = '';
    const miss = bookSave() === false && BOOKINGS.length === n;
    $('#bkName').value = 'QA จองหนึ่ง'; $('#bkPhone').value = '086-111-2233';
    rBooking();
    const uid = $('#bkUnit').value;
    $('#bkDeposit').value = 700;
    bookSave(); if ($('#cfmGo')) $('#cfmGo').onclick();
    const bk = BOOKINGS.find(x => x.name === 'QA จองหนึ่ง');
    const u = UNITS.find(x => x.id === uid);
    const c = bk && CUSTOMERS.find(x => x.id === bk.custId);
    /* จองทับคันเดิม — bookSave ต้องกันเพราะรถไม่ available แล้ว */
    $('#bkName').value = 'QA จองสอง'; $('#bkPhone').value = '086-444-5566';
    $('#bkUnit').innerHTML = '<option value="' + uid + '">x</option>'; $('#bkUnit').value = uid;
    const n2 = BOOKINGS.length;
    const dupBlocked = bookSave() === false && BOOKINGS.length === n2;
    return { miss, made: !!bk, uStatus: u && u.status, depNo: bk && bk.depositNo,
      custLinked: !!c && c.stage === 'จอง', dupBlocked, bkId: bk && bk.id, uid };
  });
  if (!g3.miss) bad('[3] ไม่กรอกชื่อ/เบอร์แต่จองได้');
  if (!g3.made) bad('[3] จองไม่สำเร็จทั้งที่กรอกครบ');
  if (g3.uStatus !== 'reserved') bad('[3] จองแล้วรถไม่ติดสถานะจอง (' + g3.uStatus + ')');
  if (!g3.depNo || g3.depNo.indexOf('RECEIPT') < 0) bad('[3] วางมัดจำแต่ไม่ออกเลขใบเสร็จ (' + g3.depNo + ')');
  if (!g3.custLinked) bad('[3] จองแล้วลูกค้าไม่ถูกสร้าง/ผูกเป็นขั้นจอง');
  if (!g3.dupBlocked) bad('[3] คันที่ติดจองแล้วยังถูกจองซ้ำได้');

  /* ---------- [4] B4 — จุดสี + ตัวกรองสต๊อก ---------- */
  const g4 = await p.evaluate(() => {
    const dotDiff = STATUS_DOT.reserved !== STATUS_DOT.sold
      && STATUS_DOT.reserved !== 'var(--ink-soft)';
    go('stock'); if (typeof stTab === 'function') stTab('table');
    $('#stStatus').value = 'reserved'; rStock();
    const rows = stList().length;
    const want = UNITS.filter(x => inScope(x.branch) && x.status === 'reserved').length;
    const txtOk = stList().every(u => statusText(u.status) === 'จองแล้ว');
    $('#stStatus').value = ''; rStock();
    return { dotDiff, rows, want, txtOk };
  });
  if (!g4.dotDiff) bad('[4] จุดสีจองยังกลืนกับสีจาง/ขายแล้ว — B4 ไม่ถูกแก้');
  if (!g4.want) bad('[4] ไม่มีรถติดจองให้ทดสอบตัวกรอง');
  else if (g4.rows !== g4.want) bad('[4] กรอง "จองแล้ว" ได้ ' + g4.rows + ' คัน ควรเป็น ' + g4.want);
  if (!g4.txtOk) bad('[4] แถวที่กรองมามีสถานะอื่นปน — ตัวกรองไม่ทำงาน');

  /* ---------- [5] ด่านคันติดจองใน saveSale + เปิดการขายจากการจอง ---------- */
  const g5 = await p.evaluate(bkId => {
    const bk = BOOKINGS.find(x => x.id === bkId);
    const uid = bk.unitId, u = UNITS.find(x => x.id === uid);
    go('sell'); sellTab('p1');
    sCustSel = ''; $('#sCust').value = 'QA คนอื่น'; $('#sPhone').value = '089-777-8899';
    sUnitSet(uid);
    const pickable = $('#sUnit').value === uid;
    const n0 = SALES.length;
    saveSale();
    const otherBlocked = SALES.length === n0 && !$('#modal').classList.contains('on')
      && u.status === 'reserved';
    /* ลูกค้าที่จอง — ผ่านทางลัดจากหน้าจอง */
    bookOpenSale(bk.id);
    const prefill = CUR === 'sell' && $('#sCust').value === bk.name && $('#sUnit').value === uid;
    saveSale(); if ($('#cfmGo')) $('#cfmGo').onclick();
    const s = SALES[SALES.length - 1];
    return { pickable, otherBlocked, prefill,
      sold: SALES.length === n0 + 1 && u.status === 'sold',
      bkClosed: bk.status === 'เปิดขายแล้ว' && bk.saleId === s.id,
      saleNo: s.docNo, noPreissue: JSON.stringify(s.docs) === '{}' };
  }, g3.bkId);
  if (!g5.pickable) bad('[5] คันติดจองหายจากตัวเลือกขาย — ลูกค้าที่จองเปิดการขายไม่ได้');
  if (!g5.otherBlocked) bad('[5] คนอื่นซื้อคันติดจองได้ — ด่านใน saveSale หลุด');
  if (!g5.prefill) bad('[5] bookOpenSale ไม่พาไปฟอร์มขายพร้อมข้อมูล');
  if (!g5.sold) bad('[5] ลูกค้าที่จองเปิดการขายไม่สำเร็จ');
  if (!g5.bkClosed) bad('[5] ขายแล้วการจองไม่ปิดเป็น "เปิดขายแล้ว"');
  if (!/-SALE-/.test(g5.saleNo || '')) bad('[5] เลขที่การขายไม่ใช่ซีรีส์ SALE (' + g5.saleNo + ') — v1.36');
  if (!g5.noPreissue) bad('[5] การขายใหม่ยังจองเลขใบกำกับล่วงหน้า — เผาเลขทิ้ง (v1.36)');

  /* ---------- [6] ยกเลิก ---------- */
  const g6 = await p.evaluate(() => {
    const bk = BOOKINGS.find(x => x.status === 'จองอยู่' && x.deposit > 0)
      || BOOKINGS.find(x => x.status === 'จองอยู่');
    if (!bk) return { skip: true };
    const u = UNITS.find(x => x.id === bk.unitId);
    const noReason = bookCancel(bk.id, '   ') === false && bk.status === 'จองอยู่';
    const ok = bookCancel(bk.id, 'ลูกค้าเปลี่ยนใจ (QA)');
    return { skip: false, noReason, ok, back: u.status === 'available',
      reason: bk.cancelReason, refund: bk.deposit > 0 ? bk.refunded === true : true };
  });
  if (g6.skip) bad('[6] ไม่มีการจองค้างให้ยกเลิก');
  else {
    if (!g6.noReason) bad('[6] ไม่กรอกเหตุผลแต่ยกเลิกได้');
    if (!g6.ok || !g6.back) bad('[6] ยกเลิกแล้วรถไม่คืน available');
    if (!g6.reason) bad('[6] เหตุผลไม่ถูกบันทึก');
    if (!g6.refund) bad('[6] มีมัดจำแต่ไม่บันทึกคืนมัดจำ');
  }

  /* ---------- [7] ป้ายจองในดีล ---------- */
  await login('ST1');
  const g7 = await p.evaluate(() => {
    const bk = BOOKINGS.find(x => x.status === 'จองอยู่' && x.custId);
    if (!bk) return { skip: true };
    go('deal'); DEAL_SEL = bk.custId; rDeal();   /* go() ล้าง DEAL_SEL — ต้องตั้งทีหลัง */
    const txt = $('#dlOne').textContent || '';
    DEAL_SEL = ''; rDeal();
    return { skip: false, chip: txt.indexOf('จองคันนี้อยู่') >= 0 };
  });
  if (g7.skip) bad('[7] ไม่มีการจองที่ผูกลูกค้าให้ทดสอบ');
  else if (!g7.chip) bad('[7] ดีลของลูกค้าที่มีจองไม่โชว์ป้าย "จองคันนี้อยู่"');

  await b.close();
  if (errors.length) fails.push(...errors);
  if (fails.length) { console.log('FAILS:'); fails.forEach(f => console.log(f)); process.exit(1); }
  console.log('ALL_CHECKS_PASS (booking-r37: 7 ข้อ)');
})().catch(e => { console.error('SUITE_CRASH', e); process.exit(2); });
