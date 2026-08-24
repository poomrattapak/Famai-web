/* ด่าน v1.38 — งานอิสระ 6 ชิ้นของบรีฟรอบ 2 (ข้อ 10 20 21 22 23 23b)
   ล็อก:
   [1] ประวัติไฟแนนซ์เก็บที่ตัวลูกค้า: ปฏิเสธ/ยื่นใหม่/ยกเลิกการขาย ถูกแช่ครบ
       รอดข้ามการยกเลิกการขาย และโชว์ในหน้าดีล
   [2] การ์ดอัตราผ่านไฟแนนซ์: ตัวเลขตรงกับเคสที่ตัดสินจริง · เซลล์ไม่เห็นการ์ด
       และเรียก kpiDrawer ตรง ๆ ก็ไม่เปิด (ด่านในฟังก์ชัน §9b) · ป๊อปอัพแยกรายเจ้า+เหตุผล
   [3] ยกเว้นมาสาย: ด่าน act:hrApprove ใน attReview · ไม่มีหมายเหตุ = ยกเว้นไม่ได้ ·
       ยกเว้นแล้ว lateSec เป็น 0 ที่ attCalc จุดเดียว — สถิติเดือน (ฐานเงินเดือน) ลดตาม
   [4] HR จอคอม: สรุปเวลาอยู่บนและเต็มกว้าง · จอมือถือไม่ล้น
   [5] รายงานการขายละเอียด: คอลัมน์ ลูกค้า(เบอร์)/รถ(รหัส·ถัง)/ไฟแนนซ์/ส่งมอบ ครบ ·
       แตะแถวเปิดรายเคส · ไฟล์ CSV = จอ (คอลัมน์และจำนวนแถวตรง)
   [6] รายเคสปิดกลางเลขบัตรเมื่อไม่มีสิทธิ์ data:idNo
   [7] ผังกระบวนการ: มี lane บริการ ต่อจากทะเบียน · ผังสิทธิ์สร้างสดจาก PERMS จริง
       (แก้สิทธิ์แล้วผังเปลี่ยนตาม) · แตะกล่องพาไปหน้านั้นจริง · ฝ่ายบริการเห็นหน้านี้ */
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

  /* ---------- [1] finHist ---------- */
  await login('ST1');
  const g1 = await p.evaluate(() => {
    const fc = FINCASES.find(x => x.status !== 'ปฏิเสธ' && x.status !== 'อนุมัติแล้ว');
    if (!fc) return { skip: true };
    const cu = CUSTOMERS.find(x => x.id === fc.custId);
    finReject(fc.id, 'ติดไฟแนนซ์เจ้าอื่น', 'SCB-QA', 'โน้ต QA');
    const h1 = cu.finHist && cu.finHist.length === 1 && cu.finHist[0].event === 'ปฏิเสธ'
      && cu.finHist[0].with === 'SCB-QA' && !!cu.finHist[0].fin;
    /* ยื่นใหม่ผ่านโมดัลจริง */
    finResubmit(fc.id);
    const sel = $('#rsFin'); if (sel && $('#rsGo')) { $('#rsGo').onclick(); }
    const h2 = cu.finHist.length === 2 && cu.finHist[1].event === 'ยื่นใหม่';
    /* ยกเลิกการขาย — ประวัติต้องรอดและงอกอีกแถว */
    const s = SALES.find(x => x.id === fc.saleId);
    voidSaleCore(s);
    const h3 = cu.finHist.length === 3 && cu.finHist[2].event === 'ยกเลิกการขาย';
    go('deal'); DEAL_SEL = cu.id; rDeal();
    const shown = $('#dlOne').textContent.indexOf('ประวัติไฟแนนซ์') >= 0
      && $('#dlOne').textContent.indexOf('SCB-QA') >= 0;
    DEAL_SEL = '';
    return { skip: false, h1, h2, h3, shown };
  });
  if (g1.skip) bad('[1] ไม่มีเคสไฟแนนซ์ค้างใน seed');
  else {
    if (!g1.h1) bad('[1] ปฏิเสธแล้วประวัติไม่ถูกแช่ (เจ้า/เหตุผล/เจ้าที่ติด)');
    if (!g1.h2) bad('[1] ยื่นใหม่แล้วประวัติไม่งอก');
    if (!g1.h3) bad('[1] ยกเลิกการขายแล้วประวัติหาย/ไม่งอกแถวยกเลิก');
    if (!g1.shown) bad('[1] หน้าดีลไม่โชว์ประวัติไฟแนนซ์');
  }

  /* ---------- [2] การ์ดอัตราผ่านไฟแนนซ์ ---------- */
  const g2 = await p.evaluate(() => {
    go('dash');
    const card = document.querySelector('[data-pop="kpi|finrate"]');
    /* คำนวณค่าที่ควรเป็นเองในด่าน — ไม่เรียกฟังก์ชันเดียวกับแอป ไม่งั้นผิดพร้อมกันแล้วยังเขียว */
    const fd = [];
    FINCASES.forEach(f => { if (!inScope(f.branch) || !brMatch(dBranch, f.branch)) return;
      const st = finStageNorm(f);
      if (st === 'อนุมัติแล้ว') { const lg = (f.log || []).filter(l => l.to === 'อนุมัติแล้ว').pop();
        const at = (lg && lg.at) || f.at; if (inPer('dash', at)) fd.push({ ok: 1 }); }
      else if (st === 'ปฏิเสธ') { const at = f.rejectAt || f.at; if (inPer('dash', at)) fd.push({ ok: 0 }); } });
    const ok = fd.filter(x => x.ok).length;
    const wantPct = fd.length ? Math.round(ok / fd.length * 100) + '' : '—';
    kpiDrawer('finrate');
    return { has: !!card, txt: card ? card.textContent : '', wantPct, n: fd.length,
      drawerOk: $('#drwT').textContent.indexOf('อัตราผ่านไฟแนนซ์') >= 0
        && $('#drwB').textContent.indexOf('แยกรายเจ้า') >= 0
        && $('#drwB').textContent.indexOf('เหตุผลที่ไม่ผ่าน') >= 0 };
  });
  if (!g2.has) bad('[2] แอดมินไม่เห็นการ์ดอัตราผ่านไฟแนนซ์');
  else if (g2.n && g2.txt.indexOf(g2.wantPct) < 0) bad('[2] ตัวเลขการ์ดไม่ตรง (' + g2.txt.slice(0, 50) + ' ควรมี ' + g2.wantPct + ')');
  if (!g2.drawerOk) bad('[2] ป๊อปอัพไม่แยกรายเจ้า/เหตุผล');
  await login('ST3');                                    /* เซลล์ */
  const g2b = await p.evaluate(() => {
    go('dash');
    const card = document.querySelector('[data-pop="kpi|finrate"]');
    $('#drwT').textContent = '';
    kpiDrawer('finrate');                                /* เรียกตรง — ด่านต้องกัน */
    return { card: !!card, opened: $('#drwT').textContent.indexOf('อัตราผ่าน') >= 0 };
  });
  if (g2b.card) bad('[2] เซลล์เห็นการ์ดอัตราผ่านไฟแนนซ์ — เกินสิทธิ์');
  if (g2b.opened) bad('[2] เซลล์เรียก kpiDrawer("finrate") ตรง ๆ แล้วเปิดได้ — ด่าน §9b หลุด');

  /* ---------- [3] ยกเว้นมาสาย ---------- */
  const g3a = await p.evaluate(() => {                   /* ยังเป็นเซลล์ — ต้องถูกกัน */
    const a = ATT.find(x => attCalc(x).late);
    if (!a) return { skip: true };
    const keep = a.review;
    const r = attReview(a, 'ok', 'ลอง', true);
    const wrote = a.review !== keep;
    a.review = keep;
    return { skip: false, blocked: r === false && !wrote };
  });
  if (!g3a.skip && !g3a.blocked) bad('[3] เซลล์เรียก attReview ตรง ๆ ได้ — ด่าน act:hrApprove หลุด');
  await login('ST2');                                    /* ผู้บริหาร */
  const g3 = await p.evaluate(() => {
    const a = ATT.find(x => attCalc(x).late);
    if (!a) return { skip: true };
    const ym = String(a.date).slice(0, 7);
    const before = attMonth(a.staffId, ym).lateMin;
    const noNote = attReview(a, 'ok', '', true) === false && !(a.review && a.review.waiveLate);
    const ok = attReview(a, 'ok', 'ไปส่งของให้ร้านก่อนเข้างาน (QA)', true) === true;
    const c = attCalc(a);
    const after = attMonth(a.staffId, ym).lateMin;
    const r = { skip: false, noNote, ok, zero: c.lateSec === 0 && c.waived === true,
      monthDrop: after < before, flag: a.review.waiveLate === true };
    attReview(a, 'ok', 'ล้าง QA', false);                 /* คืนสภาพ */
    return r;
  });
  if (g3.skip) bad('[3] seed ไม่มีวันสายให้ทดสอบ');
  else {
    if (!g3.noNote) bad('[3] ยกเว้นมาสายโดยไม่มีหมายเหตุได้');
    if (!g3.ok || !g3.flag) bad('[3] ยกเว้นมาสายพร้อมหมายเหตุไม่สำเร็จ');
    if (!g3.zero) bad('[3] ยกเว้นแล้ว attCalc ยังนับสาย — จุดตัดสินไม่ใช่จุดเดียว');
    if (!g3.monthDrop) bad('[3] สถิติเดือน (ฐานเงินเดือน) ไม่ลดตามการยกเว้น');
  }

  /* ---------- [4] HR จอคอม + มือถือ ---------- */
  const g4 = await p.evaluate(() => {
    go('hr');
    const sum = $('#attSum').closest('.card'), tab = $('#attTable').closest('.card');
    return { top: sum.getBoundingClientRect().top < tab.getBoundingClientRect().top,
      wide: Math.abs(sum.offsetWidth - sum.parentElement.offsetWidth) < 4 };
  });
  if (!g4.top) bad('[4] จอคอม: สรุปเวลาไม่ได้อยู่บนสุด');
  if (!g4.wide) bad('[4] จอคอม: สรุปเวลาไม่เต็มกว้าง');
  const ctxM = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 390, height: 844 } });
  const pm = await ctxM.newPage();
  await pm.goto(BASE + '/index.html');
  await pm.click('#lgUsers [data-id="ST2"]'); await pm.click('#lgGo'); await pm.waitForTimeout(400);
  const g4m = await pm.evaluate(() => { go('hr');
    return document.body.scrollWidth - window.innerWidth; });
  await ctxM.close();
  if (g4m > 1) bad('[4] จอมือถือหน้า HR ล้นข้าง ' + g4m + 'px');

  /* ---------- [5] รายงานการขายละเอียด + แถวกดได้ + ไฟล์=จอ ---------- */
  await login('ST1');
  const g5 = await p.evaluate(() => {
    window.__F = []; const keepCsv = csv;
    csv = (n, h, r) => window.__F.push({ n, h, rows: r });
    go('report'); RP_SEL = 'sales'; rReport();
    const head = [...document.querySelectorAll('#rpTable thead th')].map(x => x.textContent);
    const rows = [...document.querySelectorAll('#rpTable tbody tr')].filter(tr => !tr.querySelector('.empty'));
    const tr0 = rows[0];
    let drawer = '';
    if (tr0 && tr0.onclick) { tr0.onclick(); drawer = $('#drwT').textContent; closeDrawer(); }
    $('#rpCsv').onclick();
    const f = window.__F[window.__F.length - 1];
    csv = keepCsv;
    return { head: head.join(','), clk: !!(tr0 && tr0.onclick), drawer,
      fCols: f ? f.h.length : 0, fRows: f ? f.rows.length : 0,
      scrCols: head.length, scrRows: rows.length };
  });
  for (const w of ['ไฟแนนซ์', 'ส่งมอบ', 'รถ']) if (g5.head.indexOf(w) < 0) bad('[5] หัวรายงานขาดคอลัมน์ ' + w);
  if (!g5.clk) bad('[5] แถวรายงานการขายกดไม่ได้');
  if (g5.drawer.indexOf('การขาย') < 0) bad('[5] แตะแถวแล้วไม่เปิดรายเคส (' + g5.drawer + ')');
  if (g5.fCols !== g5.scrCols) bad('[5] ไฟล์มี ' + g5.fCols + ' คอลัมน์ จอมี ' + g5.scrCols + ' — ไฟล์ต้องเท่าจอ');
  if (g5.fRows !== g5.scrRows) bad('[5] ไฟล์มี ' + g5.fRows + ' แถว จอมี ' + g5.scrRows);

  /* ---------- [6] เลขบัตรปิดกลางในรายเคส ---------- */
  const g6 = await p.evaluate(() => {
    const s = SALES.find(x => !x.void && CUSTOMERS.some(c => c.id === x.custId));
    if (!s) return { skip: true };
    const c = CUSTOMERS.find(x => x.id === s.custId);
    const keepId = c.idNo; c.idNo = '8877665544332';   /* seed ไม่มีเลขบัตร — ใส่ชั่วคราวแล้วคืน */
    const digits = String(c.idNo).replace(/\D/g, '');
    const keep = PERMS[ME.role]['data:idNo'];
    PERMS[ME.role]['data:idNo'] = 'none';
    saleDrawer(s.id);
    const masked = $('#drwB').textContent.indexOf('เลขบัตร') >= 0
      && $('#drwB').textContent.replace(/\D/g, '').indexOf(digits) < 0;
    closeDrawer();
    PERMS[ME.role]['data:idNo'] = keep;
    saleDrawer(s.id);
    const full = $('#drwB').textContent.replace(/\D/g, '').indexOf(digits) >= 0;
    closeDrawer();
    c.idNo = keepId;
    return { skip: false, masked, full };
  });
  if (g6.skip) bad('[6] ไม่มีการขายที่ลูกค้ามีเลขบัตรใน seed');
  else {
    if (!g6.masked) bad('[6] ไม่มีสิทธิ์ data:idNo แต่รายเคสโชว์เลขบัตรเต็ม');
    if (!g6.full) bad('[6] มีสิทธิ์แล้วเลขบัตรกลับไม่โชว์เต็ม — มาสก์ผิดทาง');
  }

  /* ---------- [7] ผังกระบวนการ generative ---------- */
  const g7 = await p.evaluate(() => {
    go('flow');
    const names = LANES.map(l => l.n);
    const matrix0 = $('#flowWrap').textContent;
    /* generative: ปิดสิทธิ์ act:plate ของผู้บริหาร → ผังต้องเปลี่ยนตามทันที */
    const keep = PERMS.manager['act:plate'];
    PERMS.manager['act:plate'] = 'none'; rFlow();
    const matrix1 = $('#flowWrap').textContent;
    PERMS.manager['act:plate'] = keep; rFlow();
    const fgo = document.querySelector('#flowWrap [data-fgo="plate"]');
    let nav = '';
    if (fgo && fgo.onclick) { fgo.onclick(); nav = CUR; go('flow'); }
    else nav = fgo ? '(ไม่ได้ผูก onclick)' : '(ไม่มีกล่อง)';
    return { names: names.join(','),
      order: names.indexOf('บริการ') === names.indexOf('ทะเบียน') + 1,
      hasMatrix: matrix0.indexOf('ใครเห็นหน้าไหน') >= 0 && matrix0.indexOf('บันทึกเลขทะเบียน') >= 0,
      generative: matrix0 !== matrix1, nav };
  });
  if (g7.names.indexOf('บริการ') < 0) bad('[7] ไม่มี lane บริการ');
  if (!g7.order) bad('[7] lane บริการไม่ได้ต่อจากทะเบียน (' + g7.names + ')');
  if (!g7.hasMatrix) bad('[7] ไม่มีผังสิทธิ์ (ใครเห็นหน้าไหน/การกระทำ)');
  if (!g7.generative) bad('[7] แก้ PERMS แล้วผังไม่เปลี่ยน — ไม่ได้สร้างสดจากตารางสิทธิ์จริง');
  if (g7.nav !== 'plate') bad('[7] แตะกล่องแล้วไม่พาไปหน้านั้น (ได้ ' + g7.nav + ')');
  await login('ST10');                                   /* ฝ่ายบริการ */
  const g7b = await p.evaluate(() => { go('flow'); return CUR; });
  if (g7b !== 'flow') bad('[7] ฝ่ายบริการเข้าหน้าผังกระบวนการไม่ได้');

  await b.close();
  if (errors.length) fails.push(...errors);
  if (fails.length) { console.log('FAILS:'); fails.forEach(f => console.log(f)); process.exit(1); }
  console.log('ALL_CHECKS_PASS (misc-r38: 7 ข้อ)');
})().catch(e => { console.error('SUITE_CRASH', e); process.exit(2); });
