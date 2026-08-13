/* ด่านตารางสิทธิ์ (บรีฟรอบ 1 · J3) — พิสูจน์ 3 เรื่อง
   1) ค่าเริ่มต้นตรงพฤติกรรมเดิมเป๊ะ ไม่มีใครได้/เสียสิทธิ์ในวันแรก
   2) ปิดสิทธิ์ใน matrix แล้ว "ฟังก์ชันเขียน" ต้องปฏิเสธจริง ไม่ใช่แค่ปุ่มหาย (กฎ §9b)
      — ถ้าใครถอด guard ออกจากฟังก์ชัน ชุดนี้ต้องแดง (พิสูจน์แบบ mutation)
   3) permSet เองมีด่าน: คนไม่ใช่แอดมินแก้ไม่ได้ · แถวแอดมินล็อกกันล็อกตัวเองออก */
const { chromium, EXE, BASE } = require('./env');

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errors = [];
  const bad = m => fails.push(m);
  const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await p.goto(BASE + '/index.html');
  await p.click('#lgUsers [data-id="ST1"]');            /* แอดมิน */
  await p.click('#lgGo'); await p.waitForTimeout(400);

  /* ตัวช่วยในหน้า: สลับตัวตน + ตั้งค่าสิทธิ์แบบเจาะจง (ผ่าน permSet ตอนเป็นแอดมินเท่านั้น) */
  await p.evaluate(() => {
    window.__imp = id => { const st = STAFF.find(s => s.id === id);
      ME = { id: st.id, name: st.name, nick: st.nick, role: st.role, branch: st.branch }; };
    window.__set = (role, key, val) => { if (PERMS[role][key] !== val) permSet(role, key); };
  });

  /* 1 · ค่าเริ่มต้นต้องเท่าพฤติกรรมเดิม — สุ่มตรวจจุดที่เคยเป็นลิสต์ตายตัว */
  const d = await p.evaluate(() => {
    const P = permDefaults();
    return [
      ['sales ห้ามโอนย้าย',            P.sales['act:transfer'] === 'none'],
      ['stock โอนย้ายได้',             P.stock['act:transfer'] === 'write'],
      ['acct ตรวจการเงินได้',          P.acct['act:finApprove'] === 'write'],
      ['sales ตรวจการเงินไม่ได้',      P.sales['act:finApprove'] === 'none'],
      ['care ติ๊กงานบริการได้',        P.care['act:care'] === 'write'],
      ['tech ติ๊กงานบริการไม่ได้',     P.tech['act:care'] === 'none'],
      ['sales เห็นหน้าขาย',            P.sales['page:sell'] === 'write'],
      ['tech ไม่เห็นหน้าขาย',          P.tech['page:sell'] === 'none'],
      ['acct เห็นเลขบัตรเต็ม',         P.acct['data:idNo'] === 'read'],
      ['sales ไม่เห็นเลขบัตรเต็ม',     P.sales['data:idNo'] === 'none'],
      ['manager เห็นเงิน',             P.manager['data:money'] === 'read'],
      ['sales ไม่เห็นเงิน',            P.sales['data:money'] === 'none']
    ].filter(x => !x[1]).map(x => x[0]);
  });
  d.forEach(x => bad('ค่าเริ่มต้นเพี้ยน: ' + x));

  /* 2 · permSet มีด่านของตัวเอง */
  const t2 = await p.evaluate(() => {
    const before = PERMS.sales['page:stock'];
    __imp('ST2');                                        /* ผู้บริหาร — ไม่ใช่แอดมิน */
    const mgrRefused = permSet('sales', 'page:stock') === false && PERMS.sales['page:stock'] === before;
    __imp('ST1');
    const adminLocked = permSet('admin', 'page:settings') === false
      && PERMS.admin['page:settings'] === 'write';
    return { mgrRefused, adminLocked };
  });
  if (!t2.mgrRefused)  bad('คนไม่ใช่แอดมินเรียก permSet ตรง ๆ แล้วแก้สิทธิ์ได้');
  if (!t2.adminLocked) bad('แถวแอดมินแก้ได้ — เสี่ยงติ๊กจนไม่มีใครเข้าตั้งค่าได้อีก');

  /* 3 · ปิดสิทธิ์ตรวจการเงิน → finApprove ต้องปฏิเสธจริง · เปิดคืน → ทำงาน */
  const t3 = await p.evaluate(() => {
    const s = SALES.find(x => !x.void && (!x.finApproval || x.finApproval.status === 'รอตรวจ'));
    if (!s) return { skip: 'ไม่มีการขายรอตรวจใน seed' };
    __set('acct', 'act:finApprove', 'none'); __imp('ST7');
    const offBlocked = finApprove(s.id, true) === false
      && (!s.finApproval || s.finApproval.status === 'รอตรวจ');
    __imp('ST1'); __set('acct', 'act:finApprove', 'write'); __imp('ST7');
    const onWorks = finApprove(s.id, true) === true && s.finApproval.status === 'ผ่าน';
    __imp('ST1');
    return { offBlocked, onWorks };
  });
  if (t3.skip) bad('ข้าม finApprove: ' + t3.skip);
  else {
    if (!t3.offBlocked) bad('ปิดสิทธิ์ตรวจการเงินใน matrix แล้ว finApprove ยังผ่าน');
    if (!t3.onWorks)    bad('เปิดสิทธิ์คืนแล้ว finApprove ไม่ทำงาน (ด่านแรงเกินไป)');
  }

  /* 4 · ปิดสิทธิ์ฝ่ายบริการ → careTick ปฏิเสธ · เปิดคืน → ติ๊กได้ */
  const t4 = await p.evaluate(() => {
    const r = CARE[0];
    if (!r || !r.check.length) return { skip: 'ไม่มีงานฝ่ายบริการใน seed' };
    /* seed อาจติ๊กช่องแรกไว้แล้ว — เทียบก่อน/หลังแทนการเดาว่าเริ่มจากว่าง */
    const b0 = r.check[0].done;
    __set('care', 'act:care', 'none'); __imp('ST10');
    const offBlocked = careTick(r.id, 0) === false && r.check[0].done === b0;
    __imp('ST1'); __set('care', 'act:care', 'write'); __imp('ST10');
    const onWorks = careTick(r.id, 0) === true && r.check[0].done !== b0;
    __imp('ST1');
    return { offBlocked, onWorks };
  });
  if (t4.skip) bad('ข้าม careTick: ' + t4.skip);
  else {
    if (!t4.offBlocked) bad('ปิดสิทธิ์ฝ่ายบริการใน matrix แล้ว careTick ยังผ่าน');
    if (!t4.onWorks)    bad('เปิดสิทธิ์คืนแล้ว careTick ไม่ทำงาน');
  }

  /* 5 · ปิดสิทธิ์โอนย้ายของสต๊อก → กดบันทึกโอนย้ายแล้วต้องไม่เกิดอะไร · เปิดคืน → โอนได้ */
  const t5 = await p.evaluate(() => {
    const u = UNITS.find(x => x.status === 'available' && x.branch === 'FMM01');
    if (!u) return { skip: 'ไม่มีรถว่างที่ FMM01' };
    BRANCHES.push({ code: 'TSP01', co: coOf(u.branch).id, name: 'สาขาทดสอบสิทธิ์',
      prefix: 'TSP', branchNo: '00002', addr: '', active: true });
    __set('stock', 'act:transfer', 'none'); __imp('ST6');   /* สต๊อก FMM01 */
    go('transfer'); rTransfer();
    $('#tUnit').value = u.id;
    $('#tTo').innerHTML = '<option value="TSP01">x</option>'; $('#tTo').value = 'TSP01';
    const n = TRANSFERS.length;
    $('#tSave').onclick();
    const offBlocked = TRANSFERS.length === n && !$('#modal').classList.contains('on')
      && u.status === 'available';
    __imp('ST1'); __set('stock', 'act:transfer', 'write'); __imp('ST6');
    /* permSet → refreshAll วาดหน้าโอนย้ายใหม่ ค่า select ถูกรีเซ็ต — ตั้งใหม่ก่อนกด */
    rTransfer(); $('#tUnit').value = u.id; $('#tTo').value = 'TSP01';
    $('#tSave').onclick();
    if ($('#cfmGo')) $('#cfmGo').onclick();
    const onWorks = TRANSFERS.length === n + 1 && u.status === 'in_transfer';
    __imp('ST1');
    return { offBlocked, onWorks };
  });
  if (t5.skip) bad('ข้ามโอนย้าย: ' + t5.skip);
  else {
    if (!t5.offBlocked) bad('ปิดสิทธิ์โอนย้ายใน matrix แล้วสต๊อกยังโอนได้');
    if (!t5.onWorks)    bad('เปิดสิทธิ์คืนแล้วโอนย้ายไม่ทำงาน');
  }

  /* 6 · ปิดสิทธิ์ขายส่งของผู้บริหาร → wsSave เงียบ · เปิดคืน → บิลเกิด + พิมพ์ติดด่าน printDoc */
  const t6 = await p.evaluate(() => {
    const ext = WS_PARTNERS.find(x => !x.own && x.active);
    const u = UNITS.find(x => x.status === 'available' && x.branch === 'FMG01');
    if (!u) return { skip: 'ไม่มีรถว่างที่ FMG01' };
    WS_CART = [{ unitId: u.id, price: 47000 }];
    $('#wsPartner').innerHTML = '<option value="' + ext.id + '">x</option>'; $('#wsPartner').value = ext.id;
    $('#wsBranch').innerHTML = '<option value="FMG01">x</option>'; $('#wsBranch').value = 'FMG01';
    __set('manager', 'act:wholesale', 'none'); __imp('ST2');
    const n = WSALES.length;
    wsSave();
    const offBlocked = WSALES.length === n && !$('#modal').classList.contains('on');
    __imp('ST1'); __set('manager', 'act:wholesale', 'write'); __imp('ST2');
    wsSave();
    if ($('#cfmGo')) $('#cfmGo').onclick();
    const onWorks = WSALES.length === n + 1;
    const w = WSALES[n];
    /* ด่านพิมพ์ (act:printDoc) บนเอกสารขายส่ง */
    const CAP = []; printHTML = h => CAP.push(h);
    __imp('ST1'); __set('acct', 'act:printDoc', 'none'); __imp('ST7');
    wsPrint(w && w.id, false);
    const printBlocked = CAP.length === 0;
    __imp('ST1'); __set('acct', 'act:printDoc', 'write'); __imp('ST7');
    wsPrint(w && w.id, false);
    const printWorks = CAP.length === 1;
    __imp('ST1');
    return { offBlocked, onWorks, printBlocked, printWorks };
  });
  if (t6.skip) bad('ข้ามขายส่ง: ' + t6.skip);
  else {
    if (!t6.offBlocked)   bad('ปิดสิทธิ์ขายส่งใน matrix แล้ว wsSave ยังเปิดบิลได้');
    if (!t6.onWorks)      bad('เปิดสิทธิ์คืนแล้ว wsSave ไม่ทำงาน');
    if (!t6.printBlocked) bad('ปิดสิทธิ์พิมพ์ใน matrix แล้ว wsPrint ยังพิมพ์ได้');
    if (!t6.printWorks)   bad('เปิดสิทธิ์พิมพ์คืนแล้ว wsPrint ไม่ทำงาน');
  }

  /* 7 · ปิดหน้าใน matrix → เมนูหาย + go() ปฏิเสธ + firstScreen ไม่พาไป */
  const t7 = await p.evaluate(() => {
    __set('sales', 'page:sell', 'none'); __imp('ST3');
    buildNav();
    const offHidden = !canSee('sell') && !document.querySelector('#nav [data-s="sell"]');
    go('sell');
    const goBlocked = CUR !== 'sell' && firstScreen() !== 'sell';
    __imp('ST1'); __set('sales', 'page:sell', 'write'); __imp('ST3');
    buildNav();
    const onBack = canSee('sell') && !!document.querySelector('#nav [data-s="sell"]');
    __imp('ST1'); buildNav();
    return { offHidden, goBlocked, onBack };
  });
  if (!t7.offHidden) bad('ปิดหน้าใน matrix แล้วเมนู/canSee ยังเปิดอยู่');
  if (!t7.goBlocked) bad('ปิดหน้าใน matrix แล้ว go() ยังพาเข้าหน้าได้');
  if (!t7.onBack)    bad('เปิดหน้าคืนแล้วเมนูไม่กลับมา');

  /* 8 · ข้อมูลอ่อนไหวสลับตาม matrix: เลขบัตรเต็ม + เงิน */
  const t8 = await p.evaluate(() => {
    __set('acct', 'data:idNo', 'none'); __imp('ST7');
    const idOff = !canSeeId();
    __imp('ST1'); __set('acct', 'data:idNo', 'read'); __imp('ST7');
    const idOn = canSeeId();
    __imp('ST1');
    return { idOff, idOn };
  });
  if (!t8.idOff) bad('ปิด data:idNo ใน matrix แล้ว canSeeId ยังเปิด');
  if (!t8.idOn)  bad('เปิด data:idNo คืนแล้ว canSeeId ไม่กลับมา');

  console.log(fails.length ? 'FAILS:\n' + [...new Set(fails)].join('\n') : 'ALL_CHECKS_PASS');
  console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})();
