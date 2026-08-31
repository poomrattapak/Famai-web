/* ด่าน v1.48 — ด่านสิทธิ์ในฟังก์ชันเขียนแกนกลาง 8 ตัว (ปิดช่อง §9b ที่เหลือ)
   ที่มา: เจ้าของสั่ง "ผสานจุดแข็งของ grape เข้าฝั่งเราตามทาง ก." (31 ส.ค. 2569) —
   จุดแข็งที่ยืม: ทุกฟังก์ชันเขียนเปิดหัวด้วยด่านสิทธิ์แบบเดียวกัน ไม่พึ่งการซ่อนเมนู
   ด่านคีย์กับ permW('page:<k>') / inRoles(แท็บ) / canVoidSale() — ค่าเริ่มต้นตรงพฤติกรรมเดิมเป๊ะ
   วันแรกไม่มีใครได้/เสียสิทธิ์ (แบบเดียวกับที่ v1.45 เลือก canVoidSale)

   ทดสอบสิทธิ์ = เรียกฟังก์ชันเขียนตรง ๆ ด้วยบทบาทต้องห้าม (กฎโปรเจกต์) — ฟอร์มถูกเติมให้ถูกต้อง
   ก่อนทุกครั้ง เพื่อให้ตัวเดียวที่ยืนขวางคือด่านสิทธิ์ ไม่ใช่ validation (ไม่งั้น mutation ยังเขียว)

   ล็อก:
   [1] saveRecv  — ST7 บัญชี เรียกตรง: กล่องยืนยันต้องไม่เปิด รถต้องไม่เพิ่ม · ST1 เปิดได้ (ฟอร์มถูกจริง)
   [2] saveSale  — ST7 บัญชี: กล่องยืนยันไม่เปิด ยอดขายไม่เพิ่ม + toast บอกเหตุผล · ST1 เปิดได้
   [3] svSave    — ST3 เซลล์: ใบงานไม่เพิ่ม และเลขเอกสาร SERVICE ไม่ถูกเผา · ST1 เพิ่มได้จริง
   [4] expSave   — ST3 เซลล์: กล่องยืนยันไม่เปิด ค่าใช้จ่ายไม่เพิ่ม · ST1 เปิดได้ (ฟังก์ชันชื่อจริง ไม่ใช่ closure)
   [5] partSave  — ST3 เซลล์ (ไม่อยู่แท็บสต๊อกอะไหล่): อะไหล่ไม่เพิ่ม · ST1 เพิ่มได้ (แล้วเก็บกวาด)
   [6] partMove  — ST7 บัญชี (ไม่อยู่แท็บเบิก/ขาย): สต๊อกไม่ถูกตัด PMOVES ไม่เพิ่ม
   [7] giftSave  — ST7 บัญชี (ไม่อยู่แท็บของแถม): ของแถมไม่เพิ่ม · ST1 เพิ่มได้ (แล้วเก็บกวาด)
   [8] saveQuote — ST7 บัญชี: คืน null ใบเสนอไม่เพิ่ม และ **เลขเอกสาร QUOTE ไม่ถูกเผา** · ST1 บันทึกได้
   [9] voidSaleCore — ST3 เซลล์ เรียกตรง: คืน false การขายไม่ถูกยกเลิก รถไม่คืนสต๊อก งานทะเบียนไม่หาย
       · ST1 ยกเลิกได้จริง (คืน true, s.void ติด)

   mutation ที่ต้องแดง (ถอดทีละตัว):
   ถอด permW ใน saveRecv→[1] · saveSale→[2] · svSave→[3] · expSave→[4] · saveQuote→[8]
   ถอด ptCanW ใน partSave→[5] · partMove→[6] · giftSave→[7] · ถอด canVoidSale ใน voidSaleCore→[9] */
const { chromium, EXE, BASE } = require('./env');

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errors = [];
  const bad = m => fails.push(m);
  const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } });
  ctx.setDefaultTimeout(8000);
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await p.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await p.click('#lgUsers [data-id="ST1"]'); await p.click('#lgGo'); await p.waitForTimeout(400);
  await p.evaluate(() => {
    window.__imp = id => { const st = STAFF.find(s => s.id === id);
      ME = { id: st.id, name: st.name, nick: st.nick, role: st.role, branch: st.branch }; };
    window.__modalOn = () => $('#modal').classList.contains('on');
    window.__shut = () => { try { closeModal(); } catch (e) {} };
  });

  /* ---------- [1] saveRecv ---------- */
  const g1 = await p.evaluate(() => {
    go('recv');
    $('#rVariant').value = Object.keys(PRICE)[0];
    $('#rVariant').onchange && $('#rVariant').onchange();
    const cc = Object.keys(PRICE[$('#rVariant').value].c)[0];
    $('#rColor').innerHTML = '<option value="' + cc + '">x</option>'; $('#rColor').value = cc;
    $('#rBranch').innerHTML = '<option value="FMG01">x</option>'; $('#rBranch').value = 'FMG01';
    $('#rEngine').value = 'QA-G48-ENG'; $('#rFrame').value = 'QA-G48-FRM';
    const n0 = UNITS.length;
    $('#toasts').innerHTML = '';                       /* ล้างของเก่า — ต้องเห็น toast ของด่านนี้เอง */
    __imp('ST7'); saveRecv();
    const blocked = !__modalOn() && UNITS.length === n0;
    const toastOn = $('#toasts').children.length > 0;
    __imp('ST1'); saveRecv();
    const adminOk = __modalOn() && !!$('#cfmGo');
    __shut();
    return { blocked, toastOn, adminOk, n: UNITS.length === n0 };
  });
  if (!g1.blocked) bad('[1] ST7 เรียก saveRecv ตรง แล้วกล่องยืนยันเปิด/รถเพิ่ม — ด่านสิทธิ์ไม่อยู่ในฟังก์ชัน');
  if (!g1.toastOn) bad('[1] โดนด่านแล้วเงียบ — ต้องมี toast บอกเหตุผล (ปุ่มที่กดแล้วไม่ทำงานห้ามมี)');
  if (!g1.adminOk) bad('[1] ฟอร์มเดียวกัน แอดมินต้องเปิดกล่องยืนยันได้ (พิสูจน์ว่า [1] ตกที่ด่านสิทธิ์ ไม่ใช่ validation)');
  if (!g1.n) bad('[1] มีรถเพิ่มทั้งที่ไม่มีใครกดยืนยัน');

  /* ---------- [2] saveSale ---------- */
  const g2 = await p.evaluate(() => {
    go('sell');
    const u = UNITS.find(x => x.status === 'available' && x.retail != null && !x.clearance
      && !BOOKINGS.some(bk => bk.status === 'จองอยู่' && bk.unitId === x.id));
    $('#sUnit').innerHTML = '<option value="' + u.id + '">x</option>'; $('#sUnit').value = u.id;
    $('#sBranch').innerHTML = '<option value="' + u.branch + '">x</option>'; $('#sBranch').value = u.branch;
    sCustSel = ''; $('#sCust').value = 'QA ด่านสิทธิ์'; $('#sPhone').value = ''; $('#sPay').value = 'cash';
    const n0 = SALES.length;
    __imp('ST7'); saveSale();
    const blocked = !__modalOn() && SALES.length === n0;
    __imp('ST1'); saveSale();
    const adminOk = __modalOn() && !!$('#cfmGo');
    __shut();
    return { blocked, adminOk, n: SALES.length === n0 };
  });
  if (!g2.blocked) bad('[2] ST7 เรียก saveSale ตรง แล้วกล่องยืนยันเปิด/ยอดขายเพิ่ม');
  if (!g2.adminOk) bad('[2] ฟอร์มเดียวกัน แอดมินต้องเปิดกล่องยืนยันได้');
  if (!g2.n) bad('[2] มียอดขายเพิ่มทั้งที่ไม่มีใครกดยืนยัน');

  /* ---------- [3] svSave ---------- */
  const g3 = await p.evaluate(() => {
    go('service'); rService();
    $('#svName').value = 'QA ด่านซ่อม'; $('#svSearch').value = 'QA-G48-SV';
    $('#svPart').value = ''; $('#svKm').value = '500'; $('#svDate').value = curDate();
    const n0 = SERVICE.length, dc0 = JSON.stringify(DOC_COUNTER);
    __imp('ST3'); svSave();
    const blocked = SERVICE.length === n0;
    const noBurn = JSON.stringify(DOC_COUNTER) === dc0;
    __imp('ST1'); svSave();
    const adminOk = SERVICE.length === n0 + 1;
    return { blocked, noBurn, adminOk };
  });
  if (!g3.blocked) bad('[3] ST3 เรียก svSave ตรง แล้วใบงานเพิ่ม');
  if (!g3.noBurn) bad('[3] โดนด่านแล้วเลขเอกสาร SERVICE ยังถูกเผา — ด่านต้องมาก่อน nextDocNo');
  if (!g3.adminOk) bad('[3] ฟอร์มเดียวกัน แอดมินต้องเปิดใบงานได้');

  /* ---------- [4] expSave ---------- */
  const g4 = await p.evaluate(() => {
    go('expense'); rExpense();
    if (typeof expSave !== 'function') return { noFn: true };
    $('#eAmt').value = '123'; $('#eCat').value = 'QA-G48';
    /* ผู้เบิก = ตัว ST3 เอง (สาขาเดียวกับผู้ถูกทดสอบ) — ให้ validation ทุกด่านผ่านหมด
       เหลือด่านสิทธิ์ยืนตัวเดียว ไม่งั้น mutation ถอดด่านแล้วไปตกที่ inScope แทน (ยังเขียว = ด่านปลอม) */
    const st = STAFF.find(s => s.id === 'ST3');
    $('#eStaff').innerHTML = '<option value="' + st.id + '">x</option>'; $('#eStaff').value = st.id;
    $('#eBranch').innerHTML = '<option value="' + st.branch + '">x</option>'; $('#eBranch').value = st.branch;
    const n0 = EXPENSES.length;
    __imp('ST3'); expSave();
    const blocked = !__modalOn() && EXPENSES.length === n0;
    __imp('ST1'); expSave();
    const adminOk = __modalOn() && !!$('#cfmGo');
    __shut();
    return { blocked, adminOk, n: EXPENSES.length === n0 };
  });
  if (g4.noFn) bad('[4] ไม่มีฟังก์ชันชื่อ expSave — โค้ดยังฝังใน onclick เรียกตรงไม่ได้ = พิสูจน์ §9b ไม่ได้');
  else {
    if (!g4.blocked) bad('[4] ST3 เรียก expSave ตรง แล้วกล่องยืนยันเปิด/ค่าใช้จ่ายเพิ่ม');
    if (!g4.adminOk) bad('[4] ฟอร์มเดียวกัน แอดมินต้องเปิดกล่องยืนยันได้');
    if (!g4.n) bad('[4] มีค่าใช้จ่ายเพิ่มทั้งที่ไม่มีใครกดยืนยัน');
  }

  /* ---------- [5] partSave · [6] partMove · [7] giftSave ---------- */
  const g5 = await p.evaluate(() => {
    go('parts'); rParts();
    if (typeof partSave !== 'function' || typeof partMove !== 'function' || typeof giftSave !== 'function')
      return { noFn: true };
    /* [5] เพิ่มอะไหล่ — เซลล์ไม่อยู่ในแท็บสต๊อกอะไหล่ */
    $('#pCode').value = 'QA-G48'; $('#pName').value = 'QA อะไหล่ด่าน';
    const np0 = PARTS.length;
    __imp('ST3'); partSave();
    const pBlocked = PARTS.length === np0;
    __imp('ST1'); partSave();
    const pAdmin = PARTS.length === np0 + 1 && PARTS[PARTS.length - 1].code === 'QA-G48';
    if (pAdmin) { PARTS.pop(); }                       /* เก็บกวาด — ไม่ให้กระทบ KPI ชุดอื่น */
    /* [6] เบิก/ขายอะไหล่ — บัญชีไม่อยู่ในแท็บเบิก/ขาย */
    const pt = PARTS.find(x => x.qty > 0);
    $('#msPart').innerHTML = '<option value="' + pt.id + '">x</option>'; $('#msPart').value = pt.id;
    $('#msQty').value = '1'; $('#msBranch').innerHTML = '<option value="' + pt.branch + '">x</option>';
    $('#msBranch').value = pt.branch;
    const q0 = pt.qty, nm0 = PMOVES.length;
    __imp('ST7'); partMove();
    const mBlocked = pt.qty === q0 && PMOVES.length === nm0;
    /* [7] ของแถม — บัญชีไม่อยู่ในแท็บของแถม */
    $('#gName').value = 'QA ของแถมด่าน'; $('#gQty').value = '2';
    $('#gBranch').innerHTML = '<option value="FMG01">x</option>'; $('#gBranch').value = 'FMG01';
    const ng0 = GIFTS.length;
    giftSave();                                        /* ยังเป็น ST7 */
    const gBlocked = GIFTS.length === ng0 && !GIFTS.some(g => g.name === 'QA ของแถมด่าน');
    __imp('ST1'); giftSave();
    const gAdmin = GIFTS.some(g => g.name === 'QA ของแถมด่าน');
    if (gAdmin) { const gi = GIFTS.findIndex(g => g.name === 'QA ของแถมด่าน'); GIFTS.splice(gi, 1); }
    refreshAll();
    return { pBlocked, pAdmin, mBlocked, gBlocked, gAdmin };
  });
  if (g5.noFn) bad('[5-7] ไม่มีฟังก์ชันชื่อ partSave/partMove/giftSave — ยังฝังใน onclick');
  else {
    if (!g5.pBlocked) bad('[5] ST3 เรียก partSave ตรง แล้วอะไหล่เพิ่ม — ด่านแท็บไม่คุมตัวบันทึก');
    if (!g5.pAdmin) bad('[5] ฟอร์มเดียวกัน แอดมินต้องเพิ่มอะไหล่ได้');
    if (!g5.mBlocked) bad('[6] ST7 เรียก partMove ตรง แล้วสต๊อกถูกตัด/มีความเคลื่อนไหว');
    if (!g5.gBlocked) bad('[7] ST7 เรียก giftSave ตรง แล้วของแถมเพิ่ม');
    if (!g5.gAdmin) bad('[7] ฟอร์มเดียวกัน แอดมินต้องเพิ่มของแถมได้');
  }

  /* ---------- [8] saveQuote ---------- */
  const g8 = await p.evaluate(() => {
    go('quote');
    qSavedNo = null;
    $('#qV1').value = Object.keys(PRICE)[0]; $('#qName').value = 'QA ด่านใบเสนอ';
    const nq0 = QUOTES.length, dc0 = JSON.stringify(DOC_COUNTER);
    __imp('ST7'); const r = saveQuote();
    const blocked = r === null && QUOTES.length === nq0;
    const noBurn = JSON.stringify(DOC_COUNTER) === dc0;
    __imp('ST1'); qSavedNo = null; const r2 = saveQuote();
    const adminOk = !!r2 && QUOTES.length === nq0 + 1;
    return { blocked, noBurn, adminOk };
  });
  if (!g8.blocked) bad('[8] ST7 เรียก saveQuote ตรง แล้วใบเสนอเพิ่ม/ไม่คืน null');
  if (!g8.noBurn) bad('[8] โดนด่านแล้วเลขเอกสาร QUOTE ถูกเผา — ด่านต้องมาก่อน nextDocNo');
  if (!g8.adminOk) bad('[8] ฟอร์มเดียวกัน แอดมินต้องบันทึกใบเสนอได้');

  /* ---------- [9] voidSaleCore ---------- */
  const g9 = await p.evaluate(() => {
    const s = SALES.find(x => !x.void && !((AR.find(a => a.saleId === x.id) || {}).paid > 0)
      && !((AR.find(a => a.saleId === x.id) || {}).pays || []).length);
    if (!s) return { noCase: true };
    const u = UNITS.find(x => x.id === s.unitId);
    const st0 = u.status, hadReg = REGS.some(r => r.saleId === s.id);
    __imp('ST3'); const r = voidSaleCore(s);
    const blocked = r === false && !s.void && u.status === st0
      && REGS.some(x => x.saleId === s.id) === hadReg;
    __imp('ST1'); const r2 = voidSaleCore(s);
    const adminOk = r2 === true && s.void === true && u.status === 'available';
    return { blocked, adminOk };
  });
  if (g9.noCase) bad('[9] seed ไม่มีการขายที่ยังไม่มีเงินเข้าให้ทดสอบ');
  else {
    if (!g9.blocked) bad('[9] ST3 เรียก voidSaleCore ตรง แล้วการขายถูกยกเลิก/รถคืนสต๊อก — §9b หลุด (issue #5 เดิม)');
    if (!g9.adminOk) bad('[9] แอดมินยกเลิกผ่าน voidSaleCore ต้องได้ (คืน true + s.void ติด + รถกลับ available)');
  }

  await b.close();
  if (errors.length) fails.push(...errors.filter((v, i, a) => a.indexOf(v) === i).slice(0, 5));
  if (fails.length) { console.log('FAILS:'); fails.forEach(f => console.log(f)); process.exit(1); }
  console.log('ALL_CHECKS_PASS (guards-r48: 9 ข้อ)');
})().catch(e => { console.error('SUITE_CRASH', e); process.exit(2); });
