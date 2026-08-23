/* ด่าน v1.34 — แถบ 4 ขั้น · ไฟแนนซ์ 3 ขั้น · ปุ่มส่งมอบเดียว+กล่องส่งมอบ · ขั้นย่อย ·
   อนิเมชัน · คอลัมน์อัพเดท (บรีฟรอบ 2 ข้อ 5 6 8 14 15 17 + คำตอบเจ้าของข้อ 4 5)
   ล็อก:
   [1] FIN_STAGES = ส่งเรื่อง → รอผลพิจารณา → อนุมัติแล้ว (3 ขั้น) · ชื่อเก่า normalize ได้
   [2] regDeliver: ด่านต้องอยู่ในฟังก์ชัน — ไฟแนนซ์ยังไม่อนุมัติ/งานถูกพัก ส่งมอบไม่ได้
   [3] regDeliver เก็บ กล่องส่งมอบ (วันที่/สถานที่/ผู้ส่งมอบ/หมายเหตุ) และกระโดดขั้นภายในให้
   [4] ขั้นย่อยใต้แถบ: ขั้นไฟแนนซ์โชว์ 3 ขั้นย่อยพร้อมสถานะ · ไม่มีปุ่มใน .substeps
   [5] อนิเมชันเส้นวิ่ง/วงเต้นมีจริง และปิดเมื่อ prefers-reduced-motion
   [6] คอลัมน์อัพเดทในตาราง + touch ประทับเวลา (มี ชม.:นาที) เมื่อขั้นไฟแนนซ์ขยับ */
const { chromium, EXE, BASE } = require('./env');

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errors = [];
  const bad = m => fails.push(m);
  const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await p.goto(BASE + '/index.html');
  await p.click('#lgUsers [data-id="ST1"]'); await p.click('#lgGo'); await p.waitForTimeout(500);

  /* ---------- [1] ไฟแนนซ์ 3 ขั้น + normalize ชื่อเก่า ---------- */
  const g1 = await p.evaluate(() => {
    const c = FINCASES.find(x => x.status !== 'ปฏิเสธ' && x.status !== 'อนุมัติแล้ว');
    if (!c) return { skip: true };
    const keep = c.status;
    c.status = 'ยื่นเอกสาร';                       /* ชื่อเก่าที่อาจค้างในฐานข้อมูลจริง */
    const ok = finAdvance(c.id);                   /* ต้อง normalize แล้วเดินได้ */
    const after = c.status;
    c.status = keep;
    return { skip: false, stages: FIN_STAGES.join('>'), ok, after };
  });
  if (g1.skip) bad('[1] ไม่มีเคสให้ทดสอบ');
  else {
    if (g1.stages !== 'ส่งเรื่อง>รอผลพิจารณา>อนุมัติแล้ว') bad('[1] FIN_STAGES = ' + g1.stages);
    if (!g1.ok || g1.after !== 'อนุมัติแล้ว') bad('[1] ชื่อขั้นเก่า "ยื่นเอกสาร" เดินต่อไม่ได้ (ได้ ' + g1.after + ')');
  }

  /* ---------- [2] ด่านใน regDeliver ---------- */
  const g2 = await p.evaluate(() => {
    const fc = FINCASES.find(x => x.status !== 'อนุมัติแล้ว' && x.status !== 'ปฏิเสธ');
    if (!fc) return { skip: true };
    const rg = REGS.find(r => r.saleId === fc.saleId);
    if (!rg || rg.deliveredAt) return { skip: true };
    const r1 = regDeliver(rg.id, { place: 'x' });          /* ไฟแนนซ์ยังไม่จบ → ต้องไม่ได้ */
    const st1 = rg.stage;
    return { skip: false, r1, delivered: !!rg.deliveredAt, st1 };
  });
  if (g2.skip) bad('[2] ไม่มีเคสไฟแนนซ์ค้างพร้อมงานทะเบียนใน seed');
  else if (g2.r1 !== false || g2.delivered) bad('[2] ไฟแนนซ์ยังไม่อนุมัติแต่ regDeliver เขียนได้ (stage=' + g2.st1 + ')');

  /* ---------- [3] regDeliver เก็บกล่องส่งมอบ + กระโดดขั้น ---------- */
  const g3 = await p.evaluate(() => {
    const s = SALES.find(x => !x.void && x.pay === 'cash' && REGS.some(r => r.saleId === x.id && !r.deliveredAt));
    if (!s) return { skip: true };
    const rg = REGS.find(r => r.saleId === s.id);
    rg.stage = 'ขายแล้ว';                                 /* เงินสดเริ่มต้นทาง — ขั้นภายในต้องไม่ขวาง */
    const ok = regDeliver(rg.id, { date: TODAY, place: 'บ้านลูกค้า QA', by: 'คนส่ง QA', note: 'โน้ต QA' });
    const r = { ok, stage: rg.stage, place: rg.dlvPlace, by: rg.dlvBy, note: rg.dlvNote,
      delivered: rg.deliveredAt, custStage: (CUSTOMERS.find(c => c.id === s.custId) || {}).stage,
      box: (() => { DEAL_SEL = s.custId; rDeal();
        const t = document.querySelector('#dlOne').textContent;
        DEAL_SEL = ''; return t.indexOf('บ้านลูกค้า QA') >= 0 && t.indexOf('คนส่ง QA') >= 0; })() };
    return r;
  });
  if (g3.skip) bad('[3] ไม่มีดีลเงินสดรอส่งมอบใน seed');
  else {
    if (!g3.ok || g3.stage !== 'ส่งมอบแล้ว') bad('[3] regDeliver เงินสดไม่กระโดดถึงส่งมอบ (stage=' + g3.stage + ')');
    if (g3.place !== 'บ้านลูกค้า QA' || g3.by !== 'คนส่ง QA' || g3.note !== 'โน้ต QA') bad('[3] กล่องส่งมอบไม่ถูกเก็บครบ');
    if (g3.custStage !== 'รับรถสำเร็จ') bad('[3] ส่งมอบแล้วลูกค้าไม่เป็นรับรถสำเร็จ');
    if (!g3.box) bad('[3] กล่องส่งมอบไม่โชว์ในหน้าดีล');
  }

  /* ---------- [4] ขั้นย่อยใต้แถบ ---------- */
  const g4 = await p.evaluate(() => {
    const d = dealAll().find(x => x.k === 'fin' && !x.off && x.fc);
    if (!d) return { skip: true };
    DEAL_SEL = d.c.id; rDeal();
    const box = document.querySelector('#dlOne .substeps');
    const r = { has: !!box,
      rows: box ? box.querySelectorAll('.substep').length : 0,
      hasNow: box ? !!box.querySelector('.substep.now') : false,
      btns: box ? box.querySelectorAll('button').length : 0,
      names: box ? [...box.querySelectorAll('.substep')].map(x => x.textContent.trim().split(/\s/)[0]).join(',') : '' };
    DEAL_SEL = ''; rDeal();
    return r;
  });
  if (g4.skip) bad('[4] ไม่มีดีลขั้นไฟแนนซ์ให้ทดสอบ');
  else {
    if (!g4.has || g4.rows !== 3) bad('[4] ขั้นย่อยไฟแนนซ์ได้ ' + g4.rows + ' แถว ควรเป็น 3');
    if (!g4.hasNow) bad('[4] ไม่มีขั้นย่อยที่ถูกทำเครื่องหมายว่ากำลังทำอยู่');
    if (g4.btns) bad('[4] มีปุ่มใน .substeps — แถบเป็นตัวบอกสถานะ ห้ามเป็นปุ่ม (§9f)');
  }

  /* ---------- [5] อนิเมชัน + reduced motion ---------- */
  const g5 = await p.evaluate(() => {
    const d = dealAll().find(x => x.k === 'fin' && !x.off);
    if (!d) return { skip: true };
    DEAL_SEL = d.c.id; rDeal();
    const line = document.querySelector('#dlOne .pl.on.cur');
    const ring = document.querySelector('#dlOne .pn.now');
    const r = { line: line ? getComputedStyle(line).animationName : '(ไม่มีเส้น)',
      ring: ring ? getComputedStyle(ring).animationName : '(ไม่มีวง)' };
    DEAL_SEL = ''; rDeal();
    return r;
  });
  if (g5.skip) bad('[5] ไม่มีดีลที่มีขั้นปัจจุบัน');
  else {
    if (g5.line !== 'stepflow') bad('[5] เส้นเข้าขั้นปัจจุบันไม่มีอนิเมชัน (' + g5.line + ')');
    if (g5.ring !== 'pnpulse') bad('[5] วงขั้นปัจจุบันไม่เต้น (' + g5.ring + ')');
  }
  /* reduced motion — เปิด context ใหม่ */
  const ctx2 = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce' });
  const p2 = await ctx2.newPage();
  await p2.goto(BASE + '/index.html');
  await p2.click('#lgUsers [data-id="ST1"]'); await p2.click('#lgGo'); await p2.waitForTimeout(400);
  const rm = await p2.evaluate(() => {
    const d = dealAll().find(x => x.k === 'fin' && !x.off);
    if (!d) return { skip: true };
    DEAL_SEL = d.c.id; rDeal();
    const line = document.querySelector('#dlOne .pl.on.cur');
    const ring = document.querySelector('#dlOne .pn.now');
    return { line: line ? getComputedStyle(line).animationName : 'none',
      ring: ring ? getComputedStyle(ring).animationName : 'none' };
  });
  await ctx2.close();
  if (!rm.skip && (rm.line !== 'none' || rm.ring !== 'none'))
    bad('[5] ตั้งค่าลดการเคลื่อนไหวแล้วอนิเมชันยังวิ่ง (' + rm.line + '/' + rm.ring + ')');

  /* ---------- [6] คอลัมน์อัพเดท + touch ---------- */
  const g6 = await p.evaluate(() => {
    go('deal'); DEAL_SEL = ''; rDeal();
    const headHas = [...document.querySelectorAll('#dlTable thead th')].some(th => th.textContent.indexOf('อัพเดท') >= 0);
    const c = FINCASES.find(x => x.status === 'ส่งเรื่อง' || x.status === 'รอผลพิจารณา');
    if (!c) return { headHas, skip: true };
    const cu = CUSTOMERS.find(x => x.id === c.custId);
    delete cu.upAt;
    finAdvance(c.id);
    const up = cu.upAt || '';                            /* จับเวลาหลังเดินหน้าอย่างเดียว — ก่อนถอยคืน */
    delete cu.upAt; finBack(c.id);
    return { headHas, skip: false, up, hasTime: /T\d\d:\d\d/.test(up) };
  });
  if (!g6.headHas) bad('[6] ตารางดีลไม่มีคอลัมน์อัพเดท');
  if (g6.skip) bad('[6] ไม่มีเคสไฟแนนซ์ให้ขยับ');
  else {
    if (!g6.up) bad('[6] ขั้นไฟแนนซ์ขยับแล้ว upAt ไม่ถูกประทับ');
    if (!g6.hasTime) bad('[6] upAt ไม่มีชั่วโมง:นาที (' + g6.up + ') — เจ้าของขอเวลาด้วย');
  }

  await b.close();
  if (errors.length) fails.push(...errors);
  if (fails.length) { console.log('FAILS:'); fails.forEach(f => console.log(f)); process.exit(1); }
  console.log('ALL_CHECKS_PASS (dealbar-r34: 6 ข้อ)');
})().catch(e => { console.error('SUITE_CRASH', e); process.exit(2); });
