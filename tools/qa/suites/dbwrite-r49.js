/* ด่าน v1.49 — เขียนลงฐานข้อมูลให้ครบทุกตารางธุรกรรม (ครึ่งแรกของ "โหลดข้อมูลกลับ" ทาง ก.)
   คำสั่งเจ้าของ 31 ส.ค. 2569: ผสานจุดแข็ง grape ทาง ก. **รวมโหลดข้อมูลกลับด้วย**
   รอบนี้ = ทุก action ที่เขียนข้อมูลต้องยิงคำขอลงตารางจริง (โหมดสาธิตยังเงียบเหมือนเดิม)
   ตารางที่เริ่มเขียน: registration · finance_case · receivable · receipt_payment · service_job ·
   expense · part · part_movement · freebie · quotation(+option) · follow_up_task · service_reminder
   + ตัวนับเลขเอกสารโหมดจริงยิง RPC next_doc_no ให้ตัวนับกลางเดินตาม

   วิธีทดสอบ: stub sbFetch (แบบ live-r22) — REQ เก็บทุกคำขอที่จะยิงจริง แล้วตรวจ path/method/body
   ล็อก:
   [1] saveSale เงินผ่อน → insert registration (sale_id/due_at/stage_log) + finance_case (company_id
       uuid จริง) + receivable (kind=finance) + follow_up_task ตาม cadence + service_reminder ตามไมล์
       + RPC next_doc_no ของเลขใบขาย
   [2] regAdvance เดินถึง "ได้ทะเบียนแล้ว" → PATCH registration (stage/stage_log/plate_no/
       plate_received_at) + งานดูแลหลังการขายลง follow_up_task (kind ขึ้นต้น care)
   [3] finAdvance → PATCH finance_case (status+stage_log) · finReject → PATCH (reject_reason+decided_at)
   [4] arReceive (ลงรับเงิน — ฟังก์ชันชื่อจริง ไม่ใช่ closure) → insert receipt_payment
       + PATCH receivable (amount_paid/settled_at) · ด่านสิทธิ์: ST3 เรียกตรงต้องเงียบทั้งคิว
   [5] svSave → insert service_job (job_no/checked_in_at) + ตัดอะไหล่ → insert part_movement
       + PATCH part.qty_on_hand · ปุ่มส่งมอบ [data-sv] → PATCH service_job.status
   [6] expSave → insert expense (category ตัวหนังสือ + approval) · expApprove → PATCH approval
   [7] partSave → insert part · partMove → insert part_movement + PATCH part
   [8] giftSave → insert freebie · ขายพร้อมของแถม → PATCH freebie.qty_on_hand
   [9] saveQuote → insert quotation + quotation_option (slot 1[/2] + variant_id uuid)
   [10] ปิดงานติดตาม (data-dltask) + careTask → PATCH follow_up_task.done_at
   [11] id เดโมใน FK ห้ามหลุดเข้าคิว (อะไหล่ id 'PT1' → ไม่มีคำขอ ไม่มี error)

   mutation ที่ต้องแดง: ถอด dbUp/dbPatch ทีละจุด → ข้อของมันแดง (ตารางอยู่หัวข้อละบรรทัดด้านบน) */
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
    window.REQ = [];
    sbFetch = async (path, opt) => {
      REQ.push({ path, method: (opt && opt.method) || 'GET', body: opt && opt.body ? JSON.parse(opt.body) : null });
      return {};
    };
    sbUpload = async () => 'x';
    LIVE = true;
    BRANCHES.forEach(br => { BR_IDS[br.code] = BR_IDS[br.code] || uuid4(); });
    FIN_CO.forEach(f => { f.dbId = uuid4(); });
    Object.keys(PRICE).forEach(v => { VARIANT_IDS[v] = VARIANT_IDS[v] || uuid4(); });
    window.__imp = id => { const st = STAFF.find(s => s.id === id);
      ME = { id: st.id, name: st.name, nick: st.nick, role: st.role, branch: st.branch }; };
    window.__drain = () => new Promise(r => { const k = () => (DB_Q.length || DB_RUN) ? setTimeout(k, 30) : r(); k(); });
    window.__of = (n, tbl, method) => REQ.slice(n).filter(x =>
      x.path.includes('/' + tbl + '?') && (!method || x.method === (method || 'POST')));
  });

  /* ---------- [1] saveSale เงินผ่อน ---------- */
  const g1 = await p.evaluate(async () => {
    go('sell');
    const u = UNITS.find(x => x.status === 'available' && x.retail != null && !x.clearance
      && !BOOKINGS.some(bk => bk.status === 'จองอยู่' && bk.unitId === x.id));
    u.id = uuid4();                                   /* จำลองรถที่โหลดจากฐานจริง */
    const g = GIFTS.find(x => x.qty > 0); g.id = uuid4(); g.branch = u.branch;
    $('#sUnit').innerHTML = '<option value="' + u.id + '">x</option>'; $('#sUnit').value = u.id;
    $('#sBranch').innerHTML = '<option value="' + u.branch + '">x</option>'; $('#sBranch').value = u.branch;
    sCustSel = ''; $('#sCust').value = 'QA ไลฟ์49'; $('#sPhone').value = '081-000-4949';
    $('#sPay').value = 'finance';
    $('#sFinCo').innerHTML = '<option value="' + FIN_CO[0].id + '">x</option>'; $('#sFinCo').value = FIN_CO[0].id;
    $('#sDown').value = '15000';   /* เกินดาวน์ขั้นต่ำ 15% — ไม่ให้กล่องเตือนดาวน์ต่ำมาคั่นโฟลว์ */
    sFree = {}; sFree[g.id] = 1; sFreeX = [];
    const n = REQ.length;
    saveSale(); if ($('#cfmGo')) $('#cfmGo').onclick();
    await __drain();
    const reg = __of(n, 'registration')[0], fc = __of(n, 'finance_case')[0];
    const ar = __of(n, 'receivable')[0];
    const tk = __of(n, 'follow_up_task'), rm = __of(n, 'service_reminder');
    const rpc = REQ.slice(n).find(x => x.path.includes('/rpc/next_doc_no'));
    const gp = __of(n, 'freebie', 'PATCH')[0];
    const s = SALES[SALES.length - 1];
    return { saleId: s.id, regId: REGS.find(r => r.saleId === s.id).id,
      fcId: (FINCASES.find(f => f.saleId === s.id) || {}).id,
      arId: (AR.find(a => a.saleId === s.id) || {}).id, giftId: g.id,
      reg: !!reg && reg.body.sale_id === s.id && !!reg.body.due_at && Array.isArray(reg.body.stage_log),
      fc: !!fc && /^[0-9a-f]{8}-/.test(fc.body.company_id || '') && fc.body.status === 'ส่งเรื่อง',
      ar: !!ar && ar.body.kind === 'finance' && ar.body.amount_due > 0,
      tk: tk.length >= 3 && tk.every(x => x.body.due_at && x.body.kind),
      rm: rm.length >= 1 && rm.every(x => x.body.target_km > 0),
      rpc: !!rpc && /^[0-9a-f]{8}-/.test(rpc.body.p_branch || '') && rpc.body.p_type === 'SALE',
      gift: !!gp && typeof gp.body.qty_on_hand === 'number' };
  });
  if (!g1.reg) bad('[1] ขายแล้วไม่ insert registration (หรือขาด sale_id/due_at/stage_log)');
  if (!g1.fc) bad('[1] ขายผ่อนไม่ insert finance_case พร้อม company_id uuid จริง');
  if (!g1.ar) bad('[1] ขายผ่อนไม่ insert receivable kind=finance');
  if (!g1.tk) bad('[1] งานติดตามตาม cadence ไม่ลง follow_up_task');
  if (!g1.rm) bad('[1] เตือนเช็กระยะไม่ลง service_reminder');
  if (!g1.rpc) bad('[1] เลขใบขายโหมดจริงไม่ยิง RPC next_doc_no (ตัวนับกลางไม่เดินตาม)');
  if (!g1.gift) bad('[8] ขายพร้อมของแถมแล้วไม่ PATCH freebie.qty_on_hand');

  /* ---------- [2] regAdvance ถึง "ได้ทะเบียนแล้ว" ---------- */
  const g2 = await p.evaluate(async (ids) => {
    const fcObj = FINCASES.find(f => f.id === ids.fcId);
    fcObj.status = 'อนุมัติแล้ว';                       /* ให้ทะเบียนเดินได้ */
    const n = REQ.length;
    regAdvance(ids.regId); regAdvance(ids.regId); regAdvance(ids.regId);
    regAdvance(ids.regId); regAdvance(ids.regId, '1กข 4949');
    await __drain();
    const ps = __of(n, 'registration', 'PATCH');
    const last = ps[ps.length - 1];
    const care = __of(n, 'follow_up_task').filter(x => String(x.body.kind).indexOf('care') === 0);
    return { n: ps.length, last: !!last && last.body.stage === 'ได้ทะเบียนแล้ว'
        && last.body.plate_no === '1กข 4949' && !!last.body.plate_received_at
        && Array.isArray(last.body.stage_log),
      care: care.length >= 3 };
  }, g1);
  if (g2.n < 5) bad('[2] เดินขั้นทะเบียน 5 ครั้งแต่ PATCH registration ' + g2.n + ' ครั้ง');
  if (!g2.last) bad('[2] ขั้นสุดท้ายไม่ครบ (stage/plate_no/plate_received_at/stage_log)');
  if (!g2.care) bad('[2] ได้ป้ายแล้วงานดูแลหลังการขายไม่ลง follow_up_task (kind ขึ้นต้น care)');

  /* ---------- [3] finAdvance / finReject ---------- */
  const g3 = await p.evaluate(async () => {
    /* เคสใหม่แยกจาก [2] — สร้างขายผ่อนอีกใบเร็ว ๆ */
    const u = UNITS.find(x => x.status === 'available' && x.retail != null && !x.clearance
      && !BOOKINGS.some(bk => bk.status === 'จองอยู่' && bk.unitId === x.id));
    u.id = uuid4();
    $('#sUnit').innerHTML = '<option value="' + u.id + '">x</option>'; $('#sUnit').value = u.id;
    $('#sBranch').innerHTML = '<option value="' + u.branch + '">x</option>'; $('#sBranch').value = u.branch;
    sCustSel = ''; $('#sCust').value = 'QA ไลฟ์49บี'; $('#sPhone').value = '081-000-4950';
    $('#sPay').value = 'finance';
    $('#sFinCo').innerHTML = '<option value="' + FIN_CO[0].id + '">x</option>'; $('#sFinCo').value = FIN_CO[0].id;
    $('#sDown').value = '15000';
    sFree = {}; sFreeX = [];
    saveSale(); if ($('#cfmGo')) $('#cfmGo').onclick();
    const s = SALES[SALES.length - 1];
    const fc = FINCASES.find(f => f.saleId === s.id);
    const n = REQ.length;
    finAdvance(fc.id);
    finReject(fc.id, 'รายได้ไม่พอ', '', 'QA');
    await __drain();
    const ps = __of(n, 'finance_case', 'PATCH');
    return { adv: ps.some(x => x.body.status === 'ยื่นเอกสาร' || x.body.status === FIN_STAGES[1]),
      rej: ps.some(x => x.body.status === 'ปฏิเสธ' && x.body.decided_at
        && String(x.body.reject_reason).indexOf('รายได้ไม่พอ') === 0) };   /* เหตุผล+หมายเหตุถูกรวมในช่องเดียว */
  });
  if (!g3.adv) bad('[3] finAdvance ไม่ PATCH finance_case.status');
  if (!g3.rej) bad('[3] finReject ไม่ PATCH reject_reason/decided_at');

  /* ---------- [4] arReceive — ฟังก์ชันชื่อจริง + ด่านสิทธิ์ ---------- */
  const g4 = await p.evaluate(async (ids) => {
    if (typeof arReceive !== 'function') return { noFn: true };
    const a = AR.find(x => x.id === ids.arId);
    const n = REQ.length;
    __imp('ST3'); const r1 = arReceive(a.id, 1000, 'เงินสด');
    await __drain();
    const blockedQuiet = REQ.length === n && r1 === false && a.paid === 0;
    __imp('ST1'); const r2 = arReceive(a.id, 1000, 'เงินสด');
    await __drain();
    const pay = __of(n, 'receipt_payment')[0];
    const pat = __of(n, 'receivable', 'PATCH')[0];
    return { blockedQuiet, ok: r2 === true && a.paid === 1000,
      pay: !!pay && pay.body.receivable_id === a.id && pay.body.amount === 1000 && pay.body.method === 'เงินสด',
      pat: !!pat && pat.body.amount_paid === 1000 };
  }, g1);
  if (g4.noFn) bad('[4] ไม่มีฟังก์ชัน arReceive — การลงรับเงินยังฝังใน onclick พิสูจน์ไม่ได้');
  else {
    if (!g4.blockedQuiet) bad('[4] ST3 เรียก arReceive ตรงแล้วเขียนได้/มีคำขอหลุดเข้าคิว');
    if (!g4.pay) bad('[4] ลงรับเงินไม่ insert receipt_payment (receivable_id/amount/method)');
    if (!g4.pat) bad('[4] ลงรับเงินไม่ PATCH receivable.amount_paid');
  }

  /* ---------- [5] svSave + ส่งมอบ ---------- */
  const g5 = await p.evaluate(async () => {
    go('service'); rService();
    const pt = PARTS.find(x => x.qty > 0); pt.id = uuid4(); pt.branch = ME.branch;
    $('#svName').value = 'QA ซ่อมไลฟ์'; $('#svSearch').value = 'QA-LIVE-SV'; $('#svKm').value = '450';
    $('#svDate').value = curDate();
    $('#svPart').innerHTML = '<option value="' + pt.id + '">x</option>'; $('#svPart').value = pt.id;
    const q0 = pt.qty, n = REQ.length;
    svSave();
    await __drain();
    const job = SERVICE[SERVICE.length - 1];
    const sj = __of(n, 'service_job')[0];
    const mv = __of(n, 'part_movement')[0];
    const pp = __of(n, 'part', 'PATCH')[0];
    const n2 = REQ.length;
    /* ส่งมอบจากตาราง — จำลองปุ่ม [data-sv] */
    job.status = 'ส่งมอบแล้ว'; if (typeof svDeliver === 'function') { job.status = 'เสร็จ'; svDeliver(job.id); }
    await __drain();
    const dp = __of(n2, 'service_job', 'PATCH')[0];
    return { sj: !!sj && sj.body.job_no === job.no && !!sj.body.checked_in_at && sj.body.status === 'รับเข้า',
      mv: !!mv && mv.body.part_id === pt.id && mv.body.kind === 'job' && mv.body.qty === -1 && mv.body.job_id === job.id,
      pp: !!pp && pp.body.qty_on_hand === q0 - 1,
      dp: !!dp && dp.body.status === 'ส่งมอบแล้ว' };
  });
  if (!g5.sj) bad('[5] เปิดใบงานไม่ insert service_job (job_no/checked_in_at/status)');
  if (!g5.mv) bad('[5] ตัดอะไหล่เข้าใบงานไม่ insert part_movement (kind=job/qty=-1/job_id)');
  if (!g5.pp) bad('[5] ตัดอะไหล่แล้วไม่ PATCH part.qty_on_hand');
  if (!g5.dp) bad('[5] ส่งมอบใบงานไม่ PATCH service_job.status (ต้องมีฟังก์ชัน svDeliver)');

  /* ---------- [6] expSave + expApprove ---------- */
  const g6 = await p.evaluate(async () => {
    go('expense'); rExpense();
    $('#eAmt').value = '777'; $('#eCat').value = 'QA-live';
    const st = STAFF.find(s => s.id === 'ST1');
    $('#eStaff').innerHTML = '<option value="' + st.id + '">x</option>'; $('#eStaff').value = st.id;
    $('#eBranch').innerHTML = '<option value="FMG01">x</option>'; $('#eBranch').value = 'FMG01';
    const n = REQ.length;
    expSave(); if ($('#cfmGo')) $('#cfmGo').onclick();
    await __drain();
    const e = EXPENSES[EXPENSES.length - 1];
    const ins = __of(n, 'expense')[0];
    const n2 = REQ.length;
    expApprove(e.id, true, 'QA');
    await __drain();
    const pat = __of(n2, 'expense', 'PATCH')[0];
    return { ins: !!ins && ins.body.category === 'QA-live' && ins.body.amount === 777
        && ins.body.approval && ins.body.approval.status === 'รอตรวจ' && ins.body.has_receipt === false,
      pat: !!pat && pat.body.approval && pat.body.approval.status === 'ผ่าน' };
  });
  if (!g6.ins) bad('[6] บันทึกค่าใช้จ่ายไม่ insert expense (category/amount/approval/has_receipt)');
  if (!g6.pat) bad('[6] การเงินตรวจแล้วไม่ PATCH expense.approval');

  /* ---------- [7] partSave + partMove ---------- */
  const g7 = await p.evaluate(async () => {
    go('parts'); rParts();
    $('#pCode').value = 'QA-49P'; $('#pName').value = 'QA อะไหล่ไลฟ์';
    $('#pCost').value = '10'; $('#pPrice').value = '20'; $('#pQty').value = '5'; $('#pMin').value = '1';
    const n = REQ.length;
    partSave();
    await __drain();
    const np = PARTS[PARTS.length - 1];
    const ins = __of(n, 'part')[0];
    $('#msPart').innerHTML = '<option value="' + np.id + '">x</option>'; $('#msPart').value = np.id;
    $('#msQty').value = '2'; $('#msBranch').innerHTML = '<option value="' + np.branch + '">x</option>';
    $('#msType') && ($('#msType').value = 'sale');
    const n2 = REQ.length;
    partMove();
    await __drain();
    const mv = __of(n2, 'part_movement')[0];
    const pp = __of(n2, 'part', 'PATCH')[0];
    return { ins: !!ins && ins.body.code === 'QA-49P' && ins.body.qty_on_hand === 5,
      mv: !!mv && mv.body.qty === -2, pp: !!pp && pp.body.qty_on_hand === 3, pid: np.id };
  });
  if (!g7.ins) bad('[7] เพิ่มอะไหล่ไม่ insert part');
  if (!g7.mv) bad('[7] เบิก/ขายไม่ insert part_movement');
  if (!g7.pp) bad('[7] เบิก/ขายไม่ PATCH part.qty_on_hand');

  /* ---------- [8] giftSave ---------- */
  const g8 = await p.evaluate(async () => {
    $('#gName').value = 'QA ของแถมไลฟ์'; $('#gQty').value = '4'; $('#gCost').value = '50';
    $('#gPrice').value = '100'; $('#gMin').value = '1';
    $('#gBranch').innerHTML = '<option value="FMG01">x</option>'; $('#gBranch').value = 'FMG01';
    const n = REQ.length;
    giftSave();
    await __drain();
    const ins = __of(n, 'freebie')[0];
    return { ins: !!ins && ins.body.name === 'QA ของแถมไลฟ์' && ins.body.qty_on_hand === 4 };
  });
  if (!g8.ins) bad('[8] เพิ่มของแถมไม่ insert freebie');

  /* ---------- [9] saveQuote ---------- */
  const g9 = await p.evaluate(async () => {
    go('quote'); qSavedNo = null;
    const v1 = Object.keys(PRICE)[0], v2 = Object.keys(PRICE)[1];
    $('#qV1').value = v1; $('#qV2').value = v2; $('#qName').value = 'QA ใบเสนอไลฟ์';
    const n = REQ.length;
    const q = saveQuote();
    await __drain();
    const ins = __of(n, 'quotation')[0];
    const ops = __of(n, 'quotation_option');
    return { ins: !!ins && ins.body.doc_no === q.no && ins.body.customer_name === 'QA ใบเสนอไลฟ์',
      ops: ops.length === 2 && ops.every(o => /^[0-9a-f]{8}-/.test(o.body.variant_id || '') && o.body.price > 0)
        && ops.map(o => o.body.slot).sort().join() === '1,2' };
  });
  if (!g9.ins) bad('[9] บันทึกใบเสนอไม่ insert quotation');
  if (!g9.ops) bad('[9] ใบเสนอไม่ insert quotation_option ครบสองคัน (slot/variant_id uuid/price)');

  /* ---------- [10] ปิดงานติดตาม + careTask ---------- */
  const g10 = await p.evaluate(async (ids) => {
    if (typeof window.dealTaskDone !== 'function') return { noFn: true };
    const t = TASKS.find(x => x.saleId === ids.saleId && !x.done);
    const n = REQ.length;
    dealTaskDone(t.id);
    const care = CARE.find(x => x.saleId === ids.saleId);
    let ct = null;
    if (care) { ct = care.tasks.find(x => !x.done); careTask(care.id, ct.id, 'QA โทรแล้ว'); }
    await __drain();
    const ps = __of(n, 'follow_up_task', 'PATCH');
    return { tk: t.done === true && ps.some(x => x.path.includes(t.id) && x.body.done_at),
      ca: !care || ps.some(x => ct && x.path.includes(ct.id) && x.body.done_at) };
  }, g1);
  if (g10.noFn) bad('[10] ไม่มีฟังก์ชัน dealTaskDone — ปิดงานติดตามยังฝังใน onclick');
  else {
    if (!g10.tk) bad('[10] ปิดงานติดตามไม่ PATCH follow_up_task.done_at');
    if (!g10.ca) bad('[10] ปิดรอบดูแลหลังการขายไม่ PATCH follow_up_task.done_at');
  }

  /* ---------- [11] id เดโมใน FK ห้ามหลุด ---------- */
  const g11 = await p.evaluate(async () => {
    const pt = PARTS.find(x => /^PT/.test(String(x.id)) && x.qty > 0)
      || (PARTS.push({ id: 'PT99', code: 'D', name: 'เดโม', cost: 1, price: 2, qty: 3, min: 1, branch: ME.branch }), PARTS[PARTS.length - 1]);
    $('#msPart').innerHTML = '<option value="' + pt.id + '">x</option>'; $('#msPart').value = pt.id;
    $('#msQty').value = '1'; $('#msBranch').innerHTML = '<option value="' + pt.branch + '">x</option>';
    const n = REQ.length;
    partMove();
    await __drain();
    const leaked = REQ.slice(n).filter(x => x.path.includes('part'));
    return { quiet: leaked.length === 0, cut: true };
  });
  if (!g11.quiet) bad('[11] อะไหล่ id เดโม (PT..) มีคำขอหลุดเข้าคิว — 22P02 คิวตายถาวร');

  await b.close();
  if (errors.length) fails.push(...errors.filter((v, i, a) => a.indexOf(v) === i).slice(0, 5));
  if (fails.length) { console.log('FAILS:'); fails.forEach(f => console.log(f)); process.exit(1); }
  console.log('ALL_CHECKS_PASS (dbwrite-r49: 11 ข้อ)');
})().catch(e => { console.error('SUITE_CRASH', e); process.exit(2); });
