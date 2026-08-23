/* ด่าน v1.35 — หน้าทะเบียนรถ + บทบาทฝ่ายทะเบียน + จุดส่งต่อฝ่ายบริการย้ายไปวันได้ป้าย
   เจ้าของสั่ง (บรีฟรอบ 2 ข้อ 18-19 + คำตอบข้อ 3 6): เอาขั้นตอนป้ายทะเบียนไปเป็นหน้าของ
   ฝ่ายทะเบียน (ตำแหน่งใหม่) ค้นด้วยเลขถัง กรอกเลขทะเบียนแล้วปิดงาน · ฝ่ายบริการรับช่วง
   หลังได้ป้าย — รอบติดตามนับจากวันได้ป้าย · aftercare เป็นกระดานงาน + มุมมองรายลูกค้า
   ล็อก:
   [1] บทบาท reg มีจริง เห็นหน้า plate · หน้า วาดคิว "ส่งมอบแล้วยังไม่ได้ป้าย" ครบ
   [2] ด่าน act:plate อยู่ในฟังก์ชันเขียน — เซลล์เรียก regAdvance/regSavePlate/regBack/
       regPlateClose ตรง ๆ ต้องถูกปฏิเสธทุกตัว (ซ่อนเมนูไม่ใช่การกัน §9b)
   [3] regPlateClose: ไม่มีเลขทะเบียน = ปิดไม่ได้ · มีเลข = เดินถึง "ได้ทะเบียนแล้ว" + เก็บเลข
   [4] จุดเกิดงานฝ่ายบริการ: ส่งมอบแล้วยังไม่มีงาน · ได้ป้ายแล้วเกิด 1 งาน createdAt = วันได้ป้าย
       และรอบติดตามนับจากวันได้ป้าย (คำตอบเจ้าของข้อ 3)
   [5] ช่องค้นหากรองจริงด้วยเลขถัง · คำที่ไม่มีต้องได้หน้าว่าง
   [6] aftercare ใหม่: ตารางงานวันนี้ตรงกับระเบียนจริง · แตะลูกค้าเปิด drawer · ติ๊กจาก drawer ได้
   [7] ขอบเขตบทบาท reg: ไม่เห็นหน้าดีล/ขาย/รายงาน · แถบล่างมีแค่ dash/plate/cal */
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

  /* ---------- [1] บทบาท reg + หน้า plate วาดคิวครบ ---------- */
  await login('ST11');
  const g1 = await p.evaluate(() => {
    const m = MENU.find(x => x.k === 'plate');
    go('plate');
    return { role: ME.role, roleName: (ROLES.reg || {}).name,
      menuReg: !!m && m.r.indexOf('reg') >= 0, cur: CUR,
      rows: document.querySelectorAll('#plTable tbody tr').length,
      want: REGS.filter(r => regDone(r) && !regPlated(r)).length,
      kpiHas: $('#plKpi').textContent.indexOf('รอปิดงาน') >= 0 };
  });
  if (g1.role !== 'reg' || g1.roleName !== 'ฝ่ายทะเบียน') bad('[1] ST11 ไม่ใช่บทบาทฝ่ายทะเบียน (' + g1.role + ')');
  if (!g1.menuReg) bad('[1] เมนู plate ไม่เปิดให้บทบาท reg');
  if (g1.cur !== 'plate') bad('[1] reg เข้าหน้า plate ไม่ได้ (CUR=' + g1.cur + ')');
  if (!g1.want) bad('[1] seed ไม่มีคิวรอป้ายให้ทดสอบ');
  else if (g1.rows !== g1.want) bad('[1] คิววาด ' + g1.rows + ' แถว ควรเป็น ' + g1.want);
  if (!g1.kpiHas) bad('[1] KPI หน้า plate ไม่ขึ้น');

  /* ---------- [2] ด่าน act:plate ในฟังก์ชันเขียน — เซลล์ต้องถูกปฏิเสธทุกตัว ---------- */
  await login('ST3');
  const g2 = await p.evaluate(() => {
    const rg = REGS.find(r => regDone(r) && !regPlated(r));
    if (!rg) return { skip: true };
    const st0 = rg.stage, pl0 = rg.plate;
    const r = { skip: false,
      adv: regAdvance(rg.id, '9ขข 999'), save: regSavePlate(rg.id, '9ขข 999'),
      close: regPlateClose(rg.id, '9ขข 999'), back: regBack(rg.id),
      stSame: rg.stage === st0, plSame: rg.plate === pl0 };
    return r;
  });
  if (g2.skip) bad('[2] ไม่มีคิวรอป้ายใน seed');
  else {
    if (g2.adv !== false) bad('[2] เซลล์เรียก regAdvance ตรง ๆ ได้ — ด่าน act:plate หลุด');
    if (g2.save !== false) bad('[2] เซลล์เรียก regSavePlate ตรง ๆ ได้');
    if (g2.close !== false) bad('[2] เซลล์เรียก regPlateClose ตรง ๆ ได้');
    if (g2.back !== false) bad('[2] เซลล์เรียก regBack ตรง ๆ ได้');
    if (!g2.stSame || !g2.plSame) bad('[2] ถูกปฏิเสธแต่ระเบียนถูกเขียน (stage/plate เปลี่ยน)');
  }

  /* ---------- [3] regPlateClose — ด่านเลขทะเบียน + เดินถึงได้ป้าย ---------- */
  await login('ST11');
  const g3 = await p.evaluate(() => {
    const rg = REGS.find(r => regDone(r) && !regPlated(r));
    if (!rg) return { skip: true };
    const st0 = rg.stage;
    /* ต้องทั้ง "ไม่สำเร็จ" และ "ขั้นไม่ขยับแม้แต่ก้าวเดียว" — regPlateClose เดินทีละขั้น
       ถ้าด่านเลขว่างของมันหลุด งานจะค้างครึ่งทาง (ส่งมอบแล้ว→รอทะเบียน) ซึ่ง stayed จับได้ */
    const noPlate = regPlateClose(rg.id, '   ');
    const stayed = rg.stage === st0;
    const ok = regPlateClose(rg.id, '2ขค 1735');
    return { skip: false, noPlate, stayed, ok, stage: rg.stage, plate: rg.plate };
  });
  if (g3.skip) bad('[3] ไม่มีคิวรอป้ายใน seed');
  else {
    if (g3.noPlate !== false || !g3.stayed) bad('[3] ไม่กรอกเลขทะเบียนแต่ปิดงานได้');
    if (!g3.ok || g3.stage !== 'ได้ทะเบียนแล้ว') bad('[3] ปิดงานแล้วไม่ถึงได้ทะเบียนแล้ว (stage=' + g3.stage + ')');
    if (g3.plate !== '2ขค 1735') bad('[3] เลขทะเบียนไม่ถูกเก็บ (' + g3.plate + ')');
  }

  /* ---------- [4] จุดเกิดงานฝ่ายบริการ = วันได้ป้าย (คำตอบเจ้าของข้อ 3) ---------- */
  await login('ST1');
  const g4 = await p.evaluate(() => {
    const s = SALES.find(x => !x.void && x.pay === 'finance' && FINCASES.some(f => f.saleId === x.id)
      && REGS.some(r => r.saleId === x.id));
    if (!s) return { skip: true };
    const fc = FINCASES.find(f => f.saleId === s.id), rg = REGS.find(r => r.saleId === s.id);
    fc.status = 'อนุมัติแล้ว'; delete fc.rejectReason;
    rg.stage = 'อนุมัติ'; rg.hold = ''; rg.plate = ''; delete rg.deliveredAt; delete s.deliveredAt;
    const ci = CARE.findIndex(c => c.saleId === s.id); if (ci >= 0) CARE.splice(ci, 1);
    /* ส่งมอบย้อนหลัง 5 วัน — วันส่งมอบต้องต่างจากวันได้ป้าย ไม่งั้นแยกไม่ออกว่านับจากวันไหน */
    const dlv = regDeliver(rg.id, { date: addDays(TODAY, -5), place: 'QA', by: 'QA', note: '' });
    const atDeliver = CARE.some(c => c.saleId === s.id);
    const closed = regPlateClose(rg.id, '3ขง 435');
    const cr = CARE.find(c => c.saleId === s.id);
    const lg = (rg.log || []).filter(l => l.to === 'ได้ทะเบียนแล้ว').pop();
    return { skip: false, dlv, atDeliver, closed, made: !!cr,
      atOk: cr && lg && cr.createdAt === lg.at && cr.createdAt !== rg.deliveredAt,
      dueOk: cr && lg && cr.tasks.length && cr.tasks[0].due === addDays(lg.at, parseInt(String(CFG.careDays).split(',')[0])) };
  });
  if (g4.skip) bad('[4] ไม่มีดีลผ่อนใน seed ให้เดิน');
  else {
    if (!g4.dlv || !g4.closed) bad('[4] เดินเส้นทางส่งมอบ→ได้ป้ายไม่สำเร็จ');
    if (g4.atDeliver) bad('[4] งานฝ่ายบริการเกิดตั้งแต่ส่งมอบ — ต้องรอวันได้ป้าย');
    if (!g4.made) bad('[4] ได้ป้ายแล้วงานฝ่ายบริการไม่เกิด');
    if (!g4.atOk) bad('[4] createdAt ของงานไม่ใช่วันได้ป้ายจาก log');
    if (!g4.dueOk) bad('[4] รอบติดตามแรกไม่ได้นับจากวันได้ป้าย');
  }

  /* ---------- [5] ค้นหาด้วยเลขถัง ---------- */
  await login('ST11');
  const g5 = await p.evaluate(() => {
    go('plate');
    const rg = REGS.find(r => regDone(r) && !regPlated(r));
    if (!rg) return { skip: true };
    const s = SALES.find(x => x.id === rg.saleId), u = UNITS.find(x => x.id === s.unitId);
    const all = REGS.filter(r => regDone(r) && !regPlated(r)).length;
    const q = $('#plQ');
    if (!q.oninput) return { skip: false, noWire: true };   /* หน้าไม่เคยถูกวาด — อย่าให้ทั้งชุดล้ม */
    q.value = u.frame; q.oninput();
    const hit = document.querySelectorAll('#plTable tbody tr td b').length;
    const hitHas = $('#plTable').textContent.indexOf(u.frame) >= 0;
    q.value = 'ไม่มีเลขถังนี้แน่นอน'; q.oninput();
    const none = document.querySelectorAll('#plTable .empty').length === 1;
    q.value = ''; q.oninput();
    const back = document.querySelectorAll('#plTable tbody tr').length;
    return { skip: false, all, hit, hitHas, none, back };
  });
  if (g5.skip) bad('[5] ไม่มีคิวให้ค้น');
  else if (g5.noWire) bad('[5] ช่องค้นหาไม่ได้ผูกการค้นหา — หน้าไม่ถูกวาด');
  else {
    if (g5.all > 1 && g5.hit >= g5.all) bad('[5] พิมพ์เลขถังแล้วแถวไม่ถูกกรอง (' + g5.hit + '/' + g5.all + ')');
    if (!g5.hitHas || !g5.hit) bad('[5] ค้นด้วยเลขถังแล้วไม่เจอคันนั้น');
    if (!g5.none) bad('[5] ค้นคำที่ไม่มีแล้วไม่ขึ้นหน้าว่าง');
    if (g5.back !== g5.all) bad('[5] ล้างคำค้นแล้วคิวไม่กลับมาครบ');
  }

  /* ---------- [6] aftercare ใหม่ — งานวันนี้ + drawer รายลูกค้า ---------- */
  await login('ST10');
  const g6 = await p.evaluate(() => {
    go('aftercare');
    const live = CARE.map(r => ({ r, s: SALES.find(x => x.id === r.saleId) }))
      .filter(x => x.s && !x.s.void);
    const wantToday = live.reduce((n, x) => n + x.r.tasks.filter(t => !t.done && t.due <= TODAY).length, 0);
    const rows = document.querySelectorAll('#acToday tbody tr');
    const gotToday = wantToday ? rows.length : 0;
    const row = document.querySelector('#acCust [data-cdrw]');
    if (!row) return { wantToday, gotToday, noRow: true };
    if (!row.onclick) return { wantToday, gotToday, noRow: false, noWire: true };
    row.onclick();
    const opened = $('#drw').classList.contains('on');
    const drwT = $('#drwT').textContent;
    const ck = document.querySelector('#drwB [data-ck]');
    let ticked = false, by = '';
    if (ck) { const pr = ck.dataset.ck.split('|');
      const cr = CARE.find(x => x.id === pr[0]);
      const before = cr.check[+pr[1]].done;
      ck.onclick();
      ticked = cr.check[+pr[1]].done === !before; by = cr.check[+pr[1]].by;
      if (!before && ticked) careTick(pr[0], +pr[1]);   /* คืนสภาพ */
    }
    return { wantToday, gotToday, noRow: false, opened, drwT, hasCk: !!ck, ticked, by };
  });
  if (g6.noRow) bad('[6] ตารางลูกค้าในความดูแลไม่มีแถวให้แตะ');
  else if (g6.noWire) bad('[6] แถวลูกค้าไม่ได้ผูกการเปิด drawer');
  else {
    if (g6.wantToday && g6.gotToday !== g6.wantToday)
      bad('[6] งานวันนี้ ' + g6.gotToday + ' แถว ควรเป็น ' + g6.wantToday);
    if (!g6.opened || g6.drwT.indexOf('ดูแลหลังการขาย') < 0) bad('[6] แตะลูกค้าแล้ว drawer ไม่เปิด');
    if (!g6.hasCk) bad('[6] drawer ไม่มี checklist ให้ติ๊ก');
    else if (!g6.ticked) bad('[6] ติ๊ก checklist จาก drawer ไม่ได้');
  }

  /* ---------- [7] ขอบเขตบทบาท reg ---------- */
  await login('ST11');
  const g7 = await p.evaluate(() => ({
    deal: canSee('deal'), sell: canSee('sell'), report: canSee('report'),
    tabs: (BTABS.reg || {}).tabs || [] }));
  if (g7.deal || g7.sell || g7.report) bad('[7] reg เห็นหน้าดีล/ขาย/รายงาน — เกินหน้าที่');
  if (g7.tabs.join(',') !== 'dash,plate,cal') bad('[7] แถบล่างของ reg ไม่ใช่ dash/plate/cal (' + g7.tabs + ')');

  await b.close();
  if (errors.length) fails.push(...errors);
  if (fails.length) { console.log('FAILS:'); fails.forEach(f => console.log(f)); process.exit(1); }
  console.log('ALL_CHECKS_PASS (plate-r35: 7 ข้อ)');
})().catch(e => { console.error('SUITE_CRASH', e); process.exit(2); });
