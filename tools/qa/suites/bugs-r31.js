/* ด่าน v1.31 — บั๊กเงิน/สิทธิ์ 6 ตัวที่ตรวจเจอตอนอ่านโค้ดรอบบรีฟแก้ไขครั้งที่ 2
   เจ้าของสั่ง: "อยากให้แก้บั๊กทุกอย่างและเพิ่มลงไปในแผนด้วยครับ"
   ล็อก:
   [1] B10 · ไฟล์เงินค้างรับต้องเป็นข้อมูลจริง ไม่ใช่เลขคอลัมน์ (เดิมส่ง args สลับตำแหน่ง)
   [2] B11 · รายงานภาษีต้องนับบิลขายส่งด้วย (แถว + ยอดภาษีขาย)
   [3] B11 · ชุดส่งบัญชีต้องมีไฟล์ขายส่ง (6 ไฟล์) และแถวตรงกับบิลในช่วง
   [4] B6 · ขั้นไฟแนนซ์มีด่านสิทธิ์ในฟังก์ชันเขียน — role ที่ถูกปิดสิทธิ์เรียกตรง ๆ ต้องไม่เขียน
   [5] B5 · finReject เรียกตรง ๆ โดยไม่มีเหตุผลต้องไม่เขียน · ติดเจ้าอื่นต้องบอกเจ้า
   [6] B7 · ตารางโอนย้ายบนจอกรองขอบเขตสาขาเหมือนไฟล์ส่งออก
   [7] B12 · หน้าบัญชีผู้ใช้อ่านสิทธิ์จริงจาก PERMS ไม่ใช่ค่าเริ่มต้นของ ROLES */
const { chromium, EXE, BASE } = require('./env');

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errors = [];
  const bad = m => fails.push(m);
  const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  const login = async id => { await p.goto(BASE + '/index.html');
    await p.click('#lgUsers [data-id="' + id + '"]'); await p.click('#lgGo'); await p.waitForTimeout(400);
    await p.evaluate(() => { window.__F = []; csv = (n, h, r) => window.__F.push({ n, h, rows: r }); }); };

  /* ---------- [1] B10 · ไฟล์เงินค้างรับ ---------- */
  await login('ST1');
  const ar = await p.evaluate(() => {
    go('ar'); const n0 = window.__F.length;
    document.querySelector('#expAr').click();
    const f = window.__F[n0];
    if (!f) return { none: true };
    const want = AR.filter(a => inScope(a.branch)).length;
    return { none: false, cols: f.h.length, rows: f.rows.length, want,
      /* ถ้า args สลับ rows จะเป็น [4,5,6] — แถวแรกเป็นตัวเลขโดด ไม่ใช่ array ข้อมูล */
      rowShape: Array.isArray(f.rows[0]) ? f.rows[0].length : -1,
      firstIsName: Array.isArray(f.rows[0]) && typeof f.rows[0][0] === 'string' && f.rows[0][0].length > 0 };
  });
  if (ar.none) bad('[1] กด #expAr แล้วไม่มีไฟล์ออก');
  else {
    if (ar.rows !== ar.want) bad('[1] ไฟล์เงินค้างรับได้ ' + ar.rows + ' แถว ควรเป็น ' + ar.want);
    if (ar.rowShape !== ar.cols) bad('[1] แถวข้อมูลมี ' + ar.rowShape + ' ช่อง ไม่ตรงหัว ' + ar.cols + ' คอลัมน์ (args สลับ?)');
    if (!ar.firstIsName) bad('[1] ช่องแรกของแถวแรกไม่ใช่ชื่อลูกค้า — ไฟล์เป็นเลขคอลัมน์แทนข้อมูล');
  }

  /* ---------- [2]+[3] B11 · ขายส่งต้องเข้ารายงานภาษี + ชุดส่งบัญชี ----------
     seed สาธิตไม่มีบิลขายส่ง — ฉีดบิลชั่วคราว 1 ใบ (107,000 ฿ = VAT 7,000 พอดี) แล้วถอนออก
     ไม่แตะ seed จริง เพื่อไม่ให้ยอดรวมของชุดตรวจอื่นเคลื่อน */
  const b11 = await p.evaluate(() => {
    const w = { id: 'WSQA', partnerId: WS_PARTNERS[1].id, branch: ME.branch, at: TODAY,
      items: [{ unitId: 'QA', price: 107000 }], total: 107000, note: 'QA', docNo: 'QA-WS-00001',
      finApproval: { status: 'รอตรวจ', by: '', at: '', note: '' } };
    WSALES.push(w);
    go('report');
    const d = rpBuild('tax'), sc = rpScope();
    const ss = SALES.filter(s => !s.void && sc.inB(s.branch) && sc.inR(s.soldAt)).length;
    const wsRow = d.rows.find(r => String(r[1]) === 'QA-WS-00001');
    const kpiHasWs = String(d.kpi[0][2]).indexOf('ขายส่ง') >= 0;
    go('expense'); const n0 = window.__F.length;
    document.querySelector('#expBook').click();
    const files = window.__F.slice(n0);
    const wsF = files.find(f => f.n.indexOf('ขายส่ง') >= 0);
    const wsFRow = wsF && wsF.rows.find(r => String(r[3]) === 'QA-WS-00001');
    WSALES.pop();
    return { rows: d.rows.length, want: ss + 1, wsRow, kpiHasWs,
      nFiles: files.length, hasWsF: !!wsF, wsFRow };
  });
  if (b11.rows !== b11.want) bad('[2] แถวรายงานภาษีได้ ' + b11.rows + ' ควรเป็นปลีก+ขายส่ง = ' + b11.want);
  if (!b11.wsRow) bad('[2] ไม่พบแถวบิลขายส่งในรายงานภาษี');
  else {
    if (b11.wsRow[4] !== 100000 || b11.wsRow[5] !== 7000 || b11.wsRow[6] !== 107000)
      bad('[2] เลขภาษีขายส่งผิด: ก่อน=' + b11.wsRow[4] + ' vat=' + b11.wsRow[5] + ' รวม=' + b11.wsRow[6] + ' (ควร 100000/7000/107000)');
  }
  if (!b11.kpiHasWs) bad('[2] KPI ภาษีขายไม่ระบุจำนวนบิลขายส่ง');
  if (b11.nFiles !== 6) bad('[3] ชุดส่งบัญชีได้ ' + b11.nFiles + ' ไฟล์ ควรเป็น 6 (รวมขายส่ง)');
  if (!b11.hasWsF) bad('[3] ไม่มีไฟล์ขายส่งในชุดส่งบัญชี');
  else if (!b11.wsFRow) bad('[3] บิลขายส่งไม่อยู่ในไฟล์ขายส่งของชุดส่งบัญชี');

  /* ---------- [4] B6 · ด่านสิทธิ์ขั้นไฟแนนซ์ (เรียกฟังก์ชันเขียนตรง ๆ) ---------- */
  const g6 = await p.evaluate(() => {
    const c = FINCASES.find(x => x.status !== 'ปฏิเสธ' && x.status !== 'อนุมัติแล้ว');
    if (!c) return { skip: true };
    const before = c.status;
    /* จำลอง role ที่ถูกปิดสิทธิ์ — ปิดที่ตารางสิทธิ์แล้วเรียกตรง (ME ยังเป็นแอดมิน แต่สิทธิ์อ่านจาก PERMS) */
    const keep = PERMS[ME.role]['act:finStage'];
    PERMS[ME.role]['act:finStage'] = 'none';
    const rAdv = finAdvance(c.id), afterAdv = c.status;
    const rRej = finReject(c.id, 'รายได้ไม่พอ', '', '');
    const afterRej = c.status;
    PERMS[ME.role]['act:finStage'] = keep;
    const rOk = finAdvance(c.id);           /* คืนสิทธิ์แล้วต้องเดินได้ */
    const afterOk = c.status;
    finBack(c.id);                          /* ถอยคืนให้ seed เดิม */
    return { skip: false, before, rAdv, afterAdv, rRej, afterRej, rOk, afterOk };
  });
  if (g6.skip) bad('[4] ไม่มีเคสไฟแนนซ์ให้ทดสอบ');
  else {
    if (g6.rAdv !== false || g6.afterAdv !== g6.before) bad('[4] ปิดสิทธิ์แล้ว finAdvance ยังเขียนได้ (' + g6.before + '→' + g6.afterAdv + ')');
    if (g6.rRej !== false || g6.afterRej === 'ปฏิเสธ') bad('[4] ปิดสิทธิ์แล้ว finReject ยังเขียนได้');
    if (g6.rOk !== true || g6.afterOk === g6.before) bad('[4] คืนสิทธิ์แล้ว finAdvance กลับเดินไม่ได้ — ด่านแน่นเกิน');
  }

  /* ---------- [5] B5 · ด่านเหตุผลอยู่ในฟังก์ชันเขียน ---------- */
  const g5 = await p.evaluate(() => {
    const c = FINCASES.find(x => x.status !== 'ปฏิเสธ');
    if (!c) return { skip: true };
    const before = c.status;
    const rNo = finReject(c.id, '', '', '');                       /* ไม่มีเหตุผล */
    const s1 = c.status;
    const rBlk = finReject(c.id, 'ติดไฟแนนซ์เจ้าอื่น', '', '');   /* ติดเจ้าอื่นแต่ไม่บอกเจ้า */
    const s2 = c.status;
    const rYes = finReject(c.id, 'ติดไฟแนนซ์เจ้าอื่น', 'ฟินฯ ทดสอบ', 'โน้ต');
    const s3 = c.status, why = c.rejectReason, wth = c.rejectWith;
    /* คืน seed: ยื่นใหม่ให้เคสกลับมาเดินได้ */
    c.status = before; delete c.rejectReason; delete c.rejectWith; delete c.rejectNote; delete c.rejectAt;
    return { skip: false, rNo, s1, rBlk, s2, rYes, s3, why, wth, before };
  });
  if (g5.skip) bad('[5] ไม่มีเคสไฟแนนซ์ให้ทดสอบ');
  else {
    if (g5.rNo !== false || g5.s1 === 'ปฏิเสธ') bad('[5] ไม่ใส่เหตุผลแล้ว finReject ยังเขียนได้');
    if (g5.rBlk !== false || g5.s2 === 'ปฏิเสธ') bad('[5] "ติดไฟแนนซ์เจ้าอื่น" โดยไม่บอกเจ้า ยังเขียนได้');
    if (g5.rYes !== true || g5.s3 !== 'ปฏิเสธ' || g5.wth !== 'ฟินฯ ทดสอบ') bad('[5] ใส่ครบแล้วกลับปฏิเสธไม่ได้ — ด่านแน่นเกิน');
  }

  /* ---------- [6] B7 · จอโอนย้ายกรอง scope เท่าไฟล์ ----------
     ต้องเป็นคนที่เห็นหน้านี้จริงแต่เห็นสาขาเดียว = สต๊อก (ST6 · FMM01)
     เซลล์ใช้ไม่ได้เพราะไม่มีสิทธิ์เข้าหน้า go() จะบล็อกก่อนถึงตาราง */
  await login('ST6');
  const g7 = await p.evaluate(() => {
    go('transfer'); rTransfer();
    const scr = [...document.querySelectorAll('#tList tbody tr')].filter(tr => !tr.querySelector('.empty')).length;
    const want = TRANSFERS.filter(t => (inScope(t.from) || inScope(t.to)) && inPer('transfer', t.at)).length;
    const all = TRANSFERS.filter(t => inPer('transfer', t.at)).length;
    return { scr, want, all, page: CUR };
  });
  if (g7.page !== 'transfer') bad('[6] ST6 เข้าหน้าโอนย้ายไม่ได้ — เทสต์ตั้งต้นผิด');
  if (g7.scr !== g7.want) bad('[6] จอโอนย้ายมี ' + g7.scr + ' แถว ควรเป็น ' + g7.want + ' (ตาม scope)');
  if (g7.want === g7.all) bad('[6] seed ไม่มีการโอนย้ายนอกสาขาของ ST6 — เทสต์นี้แยกไม่ออก (ตรวจ seed)');

  /* ---------- [7] B12 · หน้าบัญชีผู้ใช้อ่าน PERMS จริง ---------- */
  await login('ST1');
  const g12 = await p.evaluate(() => {
    go('users');
    const menusOf = name => { const tr = [...document.querySelectorAll('#roleTable tbody tr')]
        .find(r => (r.querySelector('b') || {}).textContent === name);
      return tr ? tr.lastElementChild.textContent : ''; };
    const before = menusOf('เซลล์');
    PERMS.sales['page:stock'] = 'none';           /* แอดมินปิดหน้าสต๊อกของเซลล์ */
    rUsers();
    const after = menusOf('เซลล์');
    PERMS.sales['page:stock'] = 'write';
    rUsers();
    const restored = menusOf('เซลล์');
    return { hadStock: before.indexOf('สต๊อกรถ') >= 0, gone: after.indexOf('สต๊อกรถ') < 0,
      back: restored.indexOf('สต๊อกรถ') >= 0 };
  });
  if (!g12.hadStock) bad('[7] ค่าเริ่มต้นเซลล์ต้องเห็นสต๊อกรถในตารางบทบาท');
  if (!g12.gone) bad('[7] ปิดสิทธิ์หน้าสต๊อกแล้ว หน้าบัญชีผู้ใช้ยังโชว์ว่าเข้าได้ (อ่านค่าเริ่มต้นอยู่)');
  if (!g12.back) bad('[7] คืนสิทธิ์แล้วเมนูไม่กลับมา');

  await b.close();
  if (errors.length) fails.push(...errors);
  if (fails.length) { console.log('FAILS:'); fails.forEach(f => console.log(f)); process.exit(1); }
  console.log('ALL_CHECKS_PASS (bugs-r31: 7 ข้อ)');
})().catch(e => { console.error('SUITE_CRASH', e); process.exit(2); });
