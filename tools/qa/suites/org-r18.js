/* ด่านกลุ่ม ④ (บรีฟรอบ 1) — ชั้นบริษัทเหนือสาขา + ขายส่ง B2B
   สิ่งที่คุม: ใบกำกับดึงเลขภาษีจากบริษัทของสาขาที่ขาย (O4) · โอนข้ามบริษัทเฉย ๆ ไม่ได้ (A3)
   ขายผิดสาขาโดนด่านที่ฟังก์ชัน · บิลขายส่งหลายคันตัดสต๊อก/ย้ายบริษัทจริง (F1-F3)
   หลักพิสูจน์: เรียกฟังก์ชันบันทึก/เอกสารตรง ๆ ไม่ใช่ดูว่าปุ่มถูกซ่อน (กฎ §9b) */
const { chromium, EXE, BASE } = require('./env');

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errors = [];
  const bad = m => fails.push(m);
  const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await p.goto(BASE + '/index.html');
  await p.click('#lgUsers [data-id="ST1"]');            /* แอดมิน — เห็นทุกสาขา ทำได้ทุกอย่าง */
  await p.click('#lgGo'); await p.waitForTimeout(400);

  /* 1 · ใบกำกับภาษีต้องดึงชื่อ/เลขภาษีจากบริษัทของสาขาที่ขาย ไม่ใช่ค่ากลาง CFG (O4) */
  const t1 = await p.evaluate(() => {
    COMPANIES.forEach((c, i) => { c.taxId = 'SENTI' + i + 'TAX'; });
    const s = SALES.find(x => !x.void);
    const u = UNITS.find(x => x.id === s.unitId);
    const co = coOf(u.branch), idx = COMPANIES.indexOf(co);
    DOC_SALE = s.id;
    const html = docHTML('TAXINV', docData());
    return { ok: html.includes('SENTI' + idx + 'TAX') && html.includes(co.name),
      leak: COMPANIES.some((c, i) => i !== idx && html.includes('SENTI' + i + 'TAX')) };
  });
  if (!t1.ok)  bad('ใบกำกับภาษีไม่ได้ดึงชื่อ/เลขภาษีจากบริษัทของสาขาที่ขาย (O4)');
  if (t1.leak) bad('ใบกำกับภาษีมีเลขภาษีของบริษัทอื่นปนมา');

  /* 2 · โอนย้ายข้ามบริษัท = โดนบล็อกที่ฟังก์ชันบันทึก · ในบริษัทเดียวกัน = ผ่าน (A3) */
  const t2 = await p.evaluate(() => {
    go('transfer'); rTransfer();
    const u = UNITS.find(x => x.status === 'available');
    const cross = BRANCHES.find(br => !sameCo(br.code, u.branch)).code;
    $('#tUnit').value = u.id;
    $('#tTo').innerHTML = '<option value="' + cross + '">x</option>'; $('#tTo').value = cross;
    const n = TRANSFERS.length;
    $('#tSave').onclick();
    const blocked = TRANSFERS.length === n && !$('#modal').classList.contains('on')
      && u.status === 'available';
    /* สาขาใหม่ใต้บริษัทเดียวกัน — โอนได้ (ผ่าน popup ยืนยัน) */
    BRANCHES.push({ code: 'TST01', co: coOf(u.branch).id, name: 'สาขาทดสอบโอน',
      prefix: 'TST', branchNo: '00001', addr: '', active: true });
    rTransfer(); $('#tUnit').value = u.id; $('#tTo').value = 'TST01';
    $('#tSave').onclick();
    const confirmShown = $('#modal').classList.contains('on') && !!$('#cfmGo');
    if (confirmShown) $('#cfmGo').onclick();
    return { blocked, confirmShown,
      moved: TRANSFERS.length === n + 1 && u.status === 'in_transfer' };
  });
  if (!t2.blocked)      bad('โอนย้ายข้ามบริษัทเฉย ๆ ผ่านได้ (ต้องบังคับเปิดบิลขายส่งก่อน)');
  if (!t2.confirmShown) bad('โอนย้ายในบริษัทเดียวกันไม่ขึ้น popup ยืนยัน');
  if (!t2.moved)        bad('โอนย้ายในบริษัทเดียวกันไม่สำเร็จ (ด่านแรงเกินไป)');

  /* 3 · ขายในนามสาขาที่รถไม่ได้อยู่ = โดนด่านใน saveSale — ฟอร์มถูกทุกอย่างยกเว้นสาขา */
  const t3 = await p.evaluate(() => {
    go('sell');
    const u = UNITS.find(x => x.status === 'available' && x.retail != null && !x.clearance);
    const wrong = BRANCHES.find(br => br.code !== u.branch).code;
    $('#sUnit').innerHTML = '<option value="' + u.id + '">x</option>'; $('#sUnit').value = u.id;
    $('#sBranch').innerHTML = '<option value="' + u.branch + '">a</option><option value="' + wrong + '">b</option>';
    $('#sCust').value = 'ทดสอบ ด่านสาขา'; $('#sPay').value = 'cash';
    const n = SALES.length;
    $('#sBranch').value = wrong;
    saveSale();
    const blocked = SALES.length === n && !$('#modal').classList.contains('on');
    $('#sBranch').value = u.branch;
    saveSale();
    const confirmShown = $('#modal').classList.contains('on') && !!$('#cfmGo');
    if (confirmShown) $('#cfmGo').onclick();
    return { blocked, confirmShown, saved: SALES.length === n + 1 && u.status === 'sold' };
  });
  if (!t3.blocked)      bad('ขายในนามสาขาที่รถไม่ได้อยู่ บันทึกผ่านได้ (สต๊อกกับบัญชีจะไม่ตรงกัน)');
  if (!t3.confirmShown) bad('ขายสาขาตรงกันแล้วไม่ขึ้น popup ยืนยัน');
  if (!t3.saved)        bad('ขายสาขาตรงกันแล้วบันทึกไม่สำเร็จ (ด่านแรงเกินไป)');

  /* 4 · บิลขายส่งคู่ค้าภายนอก หลายคันในใบเดียว — ตัดสต๊อกจริง เลขเอกสารตามสาขาผู้ขาย */
  const t4 = await p.evaluate(() => {
    const ext = WS_PARTNERS.find(x => !x.own && x.active);
    const byBr = {};
    UNITS.filter(u => u.status === 'available').forEach(u => { (byBr[u.branch] = byBr[u.branch] || []).push(u); });
    const br = Object.keys(byBr).find(k => byBr[k].length >= 4);
    if (!br) return { skip: 'สต๊อกว่างไม่พอ 4 คันในสาขาเดียว' };
    const us = byBr[br].slice(0, 2);
    WS_CART = [{ unitId: us[0].id, price: 50000 }, { unitId: us[1].id, price: 60000 }];
    $('#wsPartner').innerHTML = '<option value="' + ext.id + '">x</option>'; $('#wsPartner').value = ext.id;
    $('#wsBranch').innerHTML = '<option value="' + br + '">x</option>'; $('#wsBranch').value = br;
    const n = WSALES.length;
    wsSave();
    if ($('#cfmGo')) $('#cfmGo').onclick();
    const w = WSALES[n];
    return { br, made: WSALES.length === n + 1, items: w ? w.items.length : 0,
      total: w ? w.total : 0, sold: us.every(u => u.status === 'sold'),
      doc: w ? (w.docNo || '').includes(bOf(br).prefix) && (w.docNo || '').includes('WSALE') : false,
      wid: w ? w.id : '' };
  });
  if (t4.skip) bad('ข้ามชุดขายส่ง: ' + t4.skip);
  else {
    if (!t4.made)        bad('บิลขายส่งภายนอกไม่ถูกบันทึก');
    if (t4.items !== 2)  bad('บิลขายส่งไม่เก็บรายการรายคัน (ได้ ' + t4.items + ' จาก 2)');
    if (t4.total !== 110000) bad('ยอดรวมบิลขายส่งผิด: ' + t4.total);
    if (!t4.sold)        bad('ขายส่งภายนอกแล้วรถไม่ถูกตัดสต๊อกเป็น sold');
    if (!t4.doc)         bad('เลขเอกสารขายส่งไม่ตามตัวนำหน้าสาขาผู้ขาย');
  }

  /* 5 · ขายส่งบริษัทในเครือ = รถย้ายเข้าสาขาปลายทางของบริษัทผู้ซื้อ สถานะยังว่าง (มีบิลรองรับ) */
  const t5 = await p.evaluate(() => {
    const own = WS_PARTNERS.find(x => x.own && x.active);
    if (!own) return { skip: 'ไม่มีคู่ค้าในเครือใน seed' };
    const dest = branchesOf(own.own).map(x => x.code).find(c => c !== $('#wsBranch').value);
    if (!dest) return { skip: 'บริษัทในเครือไม่มีสาขาปลายทาง' };
    const br = $('#wsBranch').value;
    const us = UNITS.filter(u => u.status === 'available' && u.branch === br).slice(0, 2);
    if (us.length < 2) return { skip: 'สต๊อกไม่พอ' };
    WS_CART = us.map(u => ({ unitId: u.id, price: 45000 }));
    $('#wsPartner').innerHTML = '<option value="' + own.id + '">x</option>'; $('#wsPartner').value = own.id;
    $('#wsDest').innerHTML = '<option value="' + dest + '">x</option>'; $('#wsDest').value = dest;
    const n = WSALES.length;
    wsSave();
    if ($('#cfmGo')) $('#cfmGo').onclick();
    return { made: WSALES.length === n + 1,
      moved: us.every(u => u.branch === dest && u.status === 'available') };
  });
  if (t5.skip) bad('ข้ามชุดในเครือ: ' + t5.skip);
  else {
    if (!t5.made)  bad('บิลขายส่งในเครือไม่ถูกบันทึก');
    if (!t5.moved) bad('ขายส่งในเครือแล้วรถไม่ย้ายเข้าสาขาปลายทาง (หรือสถานะเพี้ยน)');
  }

  /* 6 · ใบกำกับภาษีขายส่งติดด่านการเงินตรวจ — ใบส่งของพิมพ์ได้เสมอ (G1-G3 ฝั่งขายส่ง) */
  const t6 = await p.evaluate(wid => {
    const w = WSALES.find(x => x.id === wid); if (!w) return { skip: 'ไม่มีบิลจากชุดก่อน' };
    const CAP = []; printHTML = h => CAP.push(h);          /* ดัก ไม่ให้เปิดหน้าพิมพ์จริง */
    wsPrint(w.id, true);  const taxBlocked = CAP.length === 0;
    wsPrint(w.id, false); const plainOk    = CAP.length === 1;
    w.finApproval = { status: 'ผ่าน', by: 'ทดสอบ', at: curDate(), note: '' };
    wsPrint(w.id, true);
    const co = coOf(w.branch), idx = COMPANIES.indexOf(co);
    const taxOk = CAP.length === 2 && CAP[1].includes('SENTI' + idx + 'TAX');
    return { taxBlocked, plainOk, taxOk };
  }, t4.wid || '');
  if (t6.skip) bad('ข้ามชุดพิมพ์ขายส่ง: ' + t6.skip);
  else {
    if (!t6.taxBlocked) bad('ใบกำกับภาษีขายส่งพิมพ์ได้ทั้งที่การเงินยังไม่ตรวจ');
    if (!t6.plainOk)    bad('ใบส่งของขายส่งพิมพ์ไม่ได้ (ด่านแรงเกินไป)');
    if (!t6.taxOk)      bad('การเงินตรวจผ่านแล้วใบกำกับภาษีขายส่งยังพิมพ์ไม่ได้ หรือหัวใบไม่ใช่บริษัทผู้ขาย');
  }

  console.log(fails.length ? 'FAILS:\n' + [...new Set(fails)].join('\n') : 'ALL_CHECKS_PASS');
  console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})();
