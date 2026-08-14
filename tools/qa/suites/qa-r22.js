/* ด่าน QA รอบส่งมอบ (v1.22) — บั๊กจุดฟีเจอร์ชนกันที่เจอจากการรีวิวเจาะลึก
   ทุกข้อ reproduce มาจากบั๊กจริง: ถอดตัวแก้ออกเมื่อไหร่ ข้อนั้นต้องแดง */
const { chromium, EXE, BASE } = require('./env');

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errors = [];
  const bad = m => fails.push(m);
  const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  const login = async (pg, id) => { await pg.goto(BASE + '/index.html');
    await pg.click('#lgUsers [data-id="' + id + '"]'); await pg.click('#lgGo'); await pg.waitForTimeout(400); };
  await login(p, 'ST1');

  /* A1 · ยกเลิกการขาย/เท ต้องพาเคสสินเชื่อตายไปด้วย — ไม่งั้น badge ดีลนับงานผีที่เข้าไปหาไม่เจอ */
  const a1 = await p.evaluate(() => {
    const s = SALES.find(x => !x.void && FINCASES.some(f => f.saleId === x.id));
    if (!s) return { skip: 'ไม่มีการขายที่มีเคสสินเชื่อใน seed' };
    const before = FINCASES.filter(f => f.saleId === s.id).length;
    voidSaleCore(s);
    return { before, after: FINCASES.filter(f => f.saleId === s.id).length };
  });
  if (a1.skip) bad('ข้าม A1: ' + a1.skip);
  else if (!(a1.before === 1 && a1.after === 0)) bad('void การขายแล้วเคสสินเชื่อยังค้าง (' + a1.before + '→' + a1.after + ')');

  /* A2 · "ลูกค้าเท" ต้องโดนด่านเงินเข้าเหมือนยกเลิกธรรมดา — เงินที่รับแล้วห้ามหายเงียบ */
  const a2 = await p.evaluate(() => {
    const s = SALES.find(x => !x.void && AR.some(a => a.saleId === x.id));
    if (!s) return { skip: 'ไม่มีการขายที่มี AR' };
    const a = AR.find(x => x.saleId === s.id);
    a.paid = 500; a.pays = [{ amt: 500, at: curDate() }];
    custDropModal(s.id);
    const blocked = !$('#modal').classList.contains('on') || !$('#cdGo');
    closeModal();
    return { blocked, stillThere: AR.some(x => x.saleId === s.id) && !s.void };
  });
  if (a2.skip) bad('ข้าม A2: ' + a2.skip);
  else {
    if (!a2.blocked)    bad('มีเงินเข้าแล้วยังเปิดฟอร์มลูกค้าเทได้ (เงินจะถูกลบเงียบ)');
    if (!a2.stillThere) bad('ด่านเงินเข้าไม่กันจริง — AR/การขายถูกแตะไปแล้ว');
  }

  /* A3 · เปิดดูดีลห้ามกินเลขเอกสาร — เลข commit เฉพาะตอนพิมพ์ครั้งแรก */
  const a3 = await p.evaluate(() => {
    const s = SALES.find(x => !x.void && x.pay === 'cash');
    if (!s) return { skip: 'ไม่มีการขายเงินสด' };
    const key = Object.keys(DOC_COUNTER).join('|') + JSON.stringify(DOC_COUNTER);
    DEAL_SEL = s.custId; DEAL_KEEP = true; go('deal');
    /* เปิดดู + สลับชิปเอกสาร — ตัวนับต้องนิ่งสนิท */
    DOC_SEL = 'RECEIPT'; rDeal();
    DOC_SEL = 'TAXABB'; rDeal();
    const stable = key === Object.keys(DOC_COUNTER).join('|') + JSON.stringify(DOC_COUNTER);
    /* พิมพ์จริง = ออกเลขจริงหนึ่งครั้ง แล้วพิมพ์ซ้ำใช้เลขเดิม */
    window.__printed = 0; window.print = () => { window.__printed++; };
    DOC_SEL = 'RECEIPT'; DOC_SALE = s.id;
    printCurrentDoc();
    const no1 = s.docs && s.docs.RECEIPT;
    printCurrentDoc();
    const no2 = s.docs && s.docs.RECEIPT;
    return { stable, issued: !!no1, same: no1 === no2 };
  });
  if (a3.skip) bad('ข้าม A3: ' + a3.skip);
  else {
    if (!a3.stable) bad('เปิดดู/สลับชิปเอกสารแล้วตัวนับเลขขยับ (เลขใบกำกับรั่วทิ้ง)');
    if (!a3.issued) bad('พิมพ์แล้วเลขเอกสารไม่ถูก commit');
    if (!a3.same)   bad('พิมพ์ซ้ำได้เลขใหม่ (ต้องใช้เลขเดิม)');
  }

  /* A4 · canFixAtt/canExecCal ต้องอ่านจากตารางสิทธิ์จริง — ปิดใน matrix แล้วฟังก์ชันต้องปฏิเสธ */
  const a4 = await p.evaluate(() => {
    const real = ME;
    /* ปิด hrApprove ของ hr → HR ตัดสินใบลาไม่ได้ */
    permSet('hr', 'act:hrApprove');
    ME = Object.assign({}, ME, { id: 'ST8', role: 'hr' });
    LEAVES.push({ id: 'LVQA4', staffId: 'ST6', type: 'ลากิจ', from: addDays(curDate(), 60),
      to: addDays(curDate(), 60), status: 'รออนุมัติ' });
    const hrOff = lvDecide('LVQA4', true) === false && canFixAtt() === false;
    ME = real; permSet('hr', 'act:hrApprove');
    ME = Object.assign({}, ME, { id: 'ST8', role: 'hr' });
    const hrOn = lvDecide('LVQA4', true) === true;
    ME = real;
    /* เปิด execCal ให้ hr → เพิ่มวันหยุดได้ (เดิม role ตายตัว แอดมินให้ใครเพิ่มไม่ได้เลย) */
    permSet('hr', 'act:execCal');
    ME = Object.assign({}, ME, { id: 'ST8', role: 'hr' });
    const n = HOLIDAYS.length;
    const grant = holSave(addDays(curDate(), 90), 'ทดสอบสิทธิ์') === true && HOLIDAYS.length === n + 1;
    ME = real; permSet('hr', 'act:execCal');
    return { hrOff, hrOn, grant };
  });
  if (!a4.hrOff) bad('ปิด act:hrApprove ใน matrix แล้ว HR ยังตัดสินใบลาได้');
  if (!a4.hrOn)  bad('เปิดสิทธิ์คืนแล้วตัดสินไม่ได้ (ด่านแรงเกินไป)');
  if (!a4.grant) bad('เปิด act:execCal ให้บทบาทอื่นแล้วยังเพิ่มวันหยุดไม่ได้ (matrix ไม่มีผลจริง)');

  /* A5 · วันหยุดบริษัทต้องเป็น "วันร้านปิด" ในระบบเวลา — ไม่ใช่วันขาดงานทั้งบริษัท */
  const a5 = await p.evaluate(() => {
    const d = addDays(curDate(), 12);                      /* วันหยุด demo HO1 */
    const holClosed = !isWorkDay(d);
    /* เพิ่มวันหยุดใหม่แล้ววันนั้นต้องปิดทันที */
    holSave(addDays(curDate(), 65), 'หยุดทดสอบ A5');
    const newClosed = !isWorkDay(addDays(curDate(), 65));
    holDel(HOLIDAYS[HOLIDAYS.length - 1].id);
    return { holClosed, newClosed };
  });
  if (!a5.holClosed) bad('วันหยุดบริษัทยังถูกนับเป็นวันทำงาน (จะกลายเป็น "ขาดงาน" ทั้งบริษัท)');
  if (!a5.newClosed) bad('เพิ่มวันหยุดแล้ว isWorkDay ไม่รับรู้');

  /* A8 · ปุ่ม "ขายคันต่อไป" ต้องทำงานแม้เคยเปิดแผ่นลงเวลามาก่อน (id เดิมชนกันแล้วตายเงียบ) */
  const a8 = await p.evaluate(async () => {
    attPersonSheet(ME.id);                                  /* แผ่นลงเวลา (มีปุ่มเดือน psNext) */
    await new Promise(r => setTimeout(r, 300));
    closeDrawer();                                          /* ปิดแต่เนื้อหาค้างใน DOM — ตามบั๊กจริง */
    openModal('ขายแล้ว 🎉', '<button class="btn ghost" id="psNextSell">ขายคันต่อไป</button>');
    $('#psNextSell').onclick = closeModal;
    $('#psNextSell').onclick();
    return { closed: !$('#modal').classList.contains('on') };
  });
  if (!a8.closed) bad('ปุ่ม "ขายคันต่อไป" ยังตายเมื่อเคยเปิดแผ่นลงเวลามาก่อน');

  /* A10 · สาขาที่มีแต่บิลขายส่ง ต้องปิดไม่ได้ */
  const a10 = await p.evaluate(() => {
    BRANCHES.push({ code: 'QAB01', co: COMPANIES[0].id, name: 'สาขาทดสอบปิด', prefix: 'QAB',
      branchNo: '00009', addr: '', active: true });
    WSALES.push({ id: 'WSQA', partnerId: 'WPX', branch: 'QAB01', at: curDate(), items: [],
      total: 0, docNo: 'QAB-WSALE-2569-00001', finApproval: { status: 'รอตรวจ' } });
    return { refs: brRefs('QAB01') };
  });
  if (!(a10.refs > 0)) bad('brRefs ไม่นับบิลขายส่ง — สาขาที่มีบิลยังปิดได้');

  /* A12 · ปิดคู่ค้าที่มีบิลรอการเงินตรวจไม่ได้ */
  const a12 = await p.evaluate(() => {
    const wp = WS_PARTNERS.find(x => x.active);
    WSALES.push({ id: 'WSQA2', partnerId: wp.id, branch: 'FMG01', at: curDate(), items: [],
      total: 0, docNo: 'X', finApproval: { status: 'รอตรวจ' } });
    go('settings'); rWs();
    const btn = document.querySelector('[data-wpt="' + wp.id + '"]');
    if (btn) btn.onclick();
    return { stillActive: wp.active };
  });
  if (!a12.stillActive) bad('ปิดคู่ค้าได้ทั้งที่มีบิลรอการเงินตรวจ');

  /* A6 · badge เมนู HR — เซลล์เห็นเฉพาะใบของตัวเอง ไม่ใช่ทุกสาขาทั้งบริษัท */
  await p.close();
  const p2 = await ctx.newPage();
  p2.on('pageerror', e => errors.push('S PAGEERROR ' + e.message));
  await login(p2, 'ST3');                                   /* เซลล์ FMG01 */
  const a6 = await p2.evaluate(() => {
    /* seed: LV1 ของ ST6 (FMM01) + LV2 ของ ST7 รออนุมัติ — ไม่ใช่ของ ST3 */
    LEAVES.push({ id: 'LVQ6', staffId: ME.id, type: 'ลากิจ', from: addDays(curDate(), 40),
      to: addDays(curDate(), 40), status: 'รออนุมัติ' });
    refreshAll();
    const badge = +(document.querySelector('#bg-hr') || {}).textContent || 0;
    const mine = LEAVES.filter(l => l.status === 'รออนุมัติ' && l.staffId === ME.id).length;
    const all = LEAVES.filter(l => l.status === 'รออนุมัติ').length;
    return { badge, mine, all };
  });
  if (a6.badge !== a6.mine)
    bad('[sales] badge HR = ' + a6.badge + ' ควรนับเฉพาะของตัวเอง (' + a6.mine + ') ไม่ใช่ทั้งบริษัท (' + a6.all + ')');
  await p2.close();

  console.log(fails.length ? 'FAILS:\n' + [...new Set(fails)].join('\n') : 'ALL_CHECKS_PASS');
  console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})();
