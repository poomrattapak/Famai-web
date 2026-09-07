/* ด่าน writeback v1.49 ปรับตามบรีฟ 6 ก.ย. 2569 โดยคงการตรวจคำขอที่ส่งจริง
   [1] ยื่น finance_case โดยไม่มี sale_id/คันรถ → พิจารณา → create_sale_bundle ส่ง sale,
       registration, receivable และของแถมที่ต้องตัดใน transaction เดียว พร้อมตัวนับเอกสาร
       เปิดขายต้องยังไม่มี cadence/service_reminder แบบเดิม
   [2] การเงินอนุมัติ → ส่งมอบ ACK → โหลด UUID จริงของงานหนึ่งเดือนที่ฐานสร้าง → ปิดป้ายไม่สร้างซ้ำ
   [3] พิจารณา/ปฏิเสธคำขอก่อนขาย: status, stage_log, reject_reason, reject_note, decided_at ครบ
   [4] รับเงิน: receipt_payment และ receivable PATCH + เซลล์เรียก handler ตรงต้องเงียบ
   [5] ซ่อม: service_job + part_movement + part stock PATCH + finished status
   [6] ค่าใช้จ่ายและผลอนุมัติ [7] อะไหล่ [8] ของแถม [9] ใบเสนอและตัวเลือก
   [10] ปิดงานติดตามเดิมและงานบริการใหม่ลงฐาน [11] UUID guard กันคิวพัง
   Stub ตอบ representation ตามฐานจริงเพื่อให้ ACK guard ถูกทดสอบ ไม่อ่านแถว seed แทนรายการใหม่ */
const { chromium, EXE, BASE } = require('./env');
const {installLiveWriteAck}=require('../helpers/live-write-ack');

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
    window.__staffFixture=Object.fromEntries(STAFF.map(s=>[s.id,s]));
    STAFF.forEach(s=>{s.id=uuid4();});
    CUSTOMERS.forEach(c=>{c.ownerId=__staffFixture[c.ownerId]?.id||c.ownerId;});
    window.__imp = id => { const st = __staffFixture[id];
      ME = { id: st.id, name: st.name, nick: st.nick, role: st.role, branch: st.branch }; };
    __imp('ST1');
    window.__drain = () => new Promise(r => { const k = () => (DB_Q.length || DB_RUN) ? setTimeout(k, 30) : r(); k(); });
    window.__of = (n, tbl, method) => REQ.slice(n).filter(x =>
      x.path.split('?')[0].endsWith('/' + tbl) && (!method || x.method === (method || 'POST')));
  });

  await p.evaluate(installLiveWriteAck);
  await p.evaluate(()=>{
    window.__request=async(u,name,phone)=>{
      const c={id:uuid4(),name,phone,addr:'1 ถนนทดสอบ',idNo:'1234567890123',branch:u.branch,variant:u.variant,
        owner:ME.nick,ownerId:ME.id,intent:'เงินผ่อน',createdAt:punchNow().toISOString()};CUSTOMERS.push(c);
      const before=SALES.length;
      finApplyModal(c.id,{variant:u.variant,colorCode:u.colorCode,list:u.retail,down:15000,finId:FIN_CO[0].id});
      const ok=await finApplySave(c.id),fc=FINCASES.find(x=>x.custId===c.id&&!x.saleId);
      return {c,fc,ok,noSale:SALES.length===before&&u.status==='available'};
    };
  });

  /* [1] บรีฟใหม่: ยื่นก่อนเลือกคัน → อนุมัติ → บันทึกขายผ่าน transaction เดียว */
  const g1=await p.evaluate(async()=>{
    go('sell');const u=UNITS.find(x=>x.status==='available'&&x.retail!=null&&!x.clearance&&!BOOKINGS.some(b=>b.status==='จองอยู่'&&b.unitId===x.id));u.id=uuid4();
    const gift=GIFTS.find(x=>x.qty>0);gift.id=uuid4();gift.branch=u.branch;
    const n=REQ.length,req=await __request(u,'QA ไลฟ์49','0810004949');
    if(!req.ok||!req.fc)return {why:$('#toasts').textContent};
    for(let i=0;i<FIN_STAGES.length&&req.fc.status!=='อนุมัติแล้ว';i++)if(!await finAdvance(req.fc.id))break;
    dealSell(req.c.id);$('#sUnit').innerHTML='<option value="'+u.id+'">x</option>';$('#sUnit').value=u.id;
    $('#sBranch').innerHTML='<option value="'+u.branch+'">x</option>';$('#sBranch').value=u.branch;
    sFree={};sFree[gift.id]=1;sFreeX=[];
    const saved=await saveSale(false,true);await __drain();
    const bundle=REQ.slice(n).find(x=>x.path.includes('/rpc/create_sale_bundle')),fc=__of(n,'finance_case','POST')[0];
    const sale=SALES.find(x=>x.custId===req.c.id),args=bundle&&bundle.body;
    if(!saved||!sale||!args)return {why:$('#toasts').textContent};
    const reg=args.p_registration,ar=args.p_receivable;
    const counter=REQ.slice(n).find(x=>x.path.includes('/rpc/next_doc_no')&&x.body.p_type==='SALE');
    return {saleId:sale.id,regId:reg.id,fcId:req.fc.id,arId:ar.id,
      reg:reg.sale_id===sale.id&&!!reg.due_at&&Array.isArray(reg.stage_log),
      fc:!!fc&&fc.body.sale_id===null&&/^[0-9a-f]{8}-/.test(fc.body.company_id||'')&&fc.body.status==='ส่งเรื่อง'&&req.noSale&&args.p_sale.finance_case_id===req.fc.id,
      ar:ar.kind==='finance'&&ar.amount_due===req.fc.amount&&ar.sale_id===sale.id,
      noPremature:!__of(n,'follow_up_task','POST').length&&!__of(n,'service_reminder','POST').length,
      rpc:!!counter&&/^[0-9a-f]{8}-/.test(counter.body.p_branch||''),
      gift:args.p_gifts.some(x=>x.id===gift.id&&x.qty===1)&&sale.gifts.some(x=>x.id===gift.id&&x.qty===1)};
  });
  if(!g1.reg)bad('[1] transaction เปิดขายไม่มี registration ที่ผูกการขาย/กำหนด/ประวัติขั้น');
  if(!g1.fc)bad('[1] ต้องยื่น finance_case ก่อนคันจริงและผูกคำขอเดิมใน transaction');
  if(!g1.ar)bad('[1] transaction ไม่มี receivable ของคำขอที่อนุมัติแล้ว');
  if(!g1.noPremature)bad('[1] เปิดขายแล้วสร้างงานบริการก่อนส่งมอบ หรือยังสร้างรอบเดิม');
  if(!g1.rpc)bad('[1] เลขใบขายไม่เดินตัวนับกลาง');
  if(!g1.gift)bad('[8] transaction ไม่ส่งของแถมที่ต้องตัดสต๊อกพร้อมการขาย');

  /* [2] ฝ่ายการเงินอนุมัติ → ส่งมอบ ACK → ฐานสร้างหนึ่งงาน → ได้ป้ายไม่สร้างซ้ำ */
  const g2=await p.evaluate(async ids=>{
    const sale=SALES.find(x=>x.id===ids.saleId),reg=REGS.find(x=>x.id===ids.regId);if(!sale||!reg)return {n:0};
    await finApprove(sale.id,true);const n=REQ.length;
    await regDeliver(reg.id,{date:TODAY,by:ME.nick});
    await regAdvance(reg.id);await regAdvance(reg.id,'1กข 4949');await __drain();
    const ps=__of(n,'registration','PATCH'),last=ps[ps.length-1],care=careOf(sale.id);
    return {n:ps.length,last:!!last&&last.body.stage==='ได้ทะเบียนแล้ว'&&last.body.plate_no==='1กข 4949'&&!!last.body.plate_received_at&&Array.isArray(last.body.stage_log),
      care:!!care&&care.tasks.length===1&&care.tasks[0].source==='delivery_month'&&isUuid(care.tasks[0].id)&&!care.tasks[0].pendingSync&&care.tasks[0].due===careMonthDate(reg.deliveredAt)
        &&REQ.slice(n).some(x=>x.method==='GET'&&x.path.includes('task_source=eq.delivery_month'))&&!__of(n,'follow_up_task','POST').length};
  },g1);
  if(g2.n<3)bad('[2] ส่งมอบ→รอทะเบียน→ได้ป้าย ต้องบันทึก registration ครบ3ขั้น');
  if(!g2.last)bad('[2] ขั้นสุดท้ายไม่แช่เลขป้าย/วันได้ป้าย/stage_log');
  if(!g2.care)bad('[2] ส่งมอบต้องโหลดUUIDจริงของงานหนึ่งเดือนจากฐาน และไม่สร้างซ้ำตอนได้ป้าย');

  /* [3] พิจารณาคำขอก่อนเปิดขาย ไม่แก้ผลคำขอที่ผูกการขายแล้ว */
  const g3=await p.evaluate(async()=>{
    const u=UNITS.find(x=>x.status==='available'&&x.retail!=null&&!x.clearance);const req=await __request(u,'QA พิจารณา49','0810004950');
    if(!req.ok||!req.fc)return {adv:false,rej:false};const n=REQ.length;
    await finAdvance(req.fc.id);await finReject(req.fc.id,'รายได้ไม่พอ','','QA');await __drain();const ps=__of(n,'finance_case','PATCH');
    return {adv:ps.some(x=>x.body.status===FIN_STAGES[1]&&Array.isArray(x.body.stage_log)),rej:ps.some(x=>x.body.status==='ปฏิเสธ'&&x.body.decided_at&&x.body.reject_reason==='รายได้ไม่พอ'&&x.body.reject_note==='QA')};
  });
  if(!g3.adv)bad('[3] finAdvance ไม่ PATCH สถานะ/ประวัติคำขอ');
  if(!g3.rej)bad('[3] finReject ไม่ PATCH เหตุผล/หมายเหตุ/วันที่ตัดสิน');

  /* ---------- [4] arReceive — ฟังก์ชันชื่อจริง + ด่านสิทธิ์ ---------- */
  const g4 = await p.evaluate(async (ids) => {
    if (typeof arReceive !== 'function') return { noFn: true };
    const a = AR.find(x => x.id === ids.arId);if(!a)return {blockedQuiet:false,pay:false,pat:false};
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
    $('#svPhone').value='0897654321'; $('#svModelName').value='รถนอกรุ่นทดสอบ'; $('#svEngine').value='QA-SERVICE-ENGINE'; $('#svFrame').value='QA-SERVICE-FRAME';
    const pt = PARTS.find(x => x.qty > 0); pt.id = uuid4(); pt.branch = ME.branch;
    $('#svName').value = 'QA ซ่อมไลฟ์'; $('#svSearch').value = 'QA-LIVE-SV'; $('#svKm').value = '450';
    $('#svDate').value = curDate();
    $('#svPart').innerHTML = '<option value="' + pt.id + '">x</option>'; $('#svPart').value = pt.id;
    const q0 = pt.qty, n = REQ.length;
    await svSave();
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
    const st = __staffFixture.ST1;
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
    const q = await saveQuote();
    await __drain();
    const rpc = __of(n, 'quote_save')[0];
    const ins = rpc && {body:rpc.body.p_quote};
    const ops = (rpc?.body.p_options||[]).map(body=>({body}));
    return { ins: !!ins && ins.body.doc_no === q.no && ins.body.customer_name === 'QA ใบเสนอไลฟ์',
      ops: ops.length === 2 && ops.every(o => /^[0-9a-f]{8}-/.test(o.body.variant_id || '') && o.body.price > 0)
        && ops.map(o => o.body.slot).sort().join() === '1,2' };
  });
  if (!g9.ins) bad('[9] บันทึกใบเสนอไม่ส่งหัวผ่าน quote_save');
  if (!g9.ops) bad('[9] ใบเสนอไม่ส่งตัวเลือกผ่านธุรกรรมเดียวครบสองคัน (slot/variant_id uuid/price)');

  /* ---------- [10] ปิดงานติดตาม + careTask ---------- */
  const g10 = await p.evaluate(async (ids) => {
    if (typeof window.dealTaskDone !== 'function') return { noFn: true };
    const sale=SALES.find(x=>x.id===ids.saleId);if(!sale)return {tk:false,ca:false};
    /* fixture งานเก่าที่โหลดมา ต้องปิดได้ต่อ แม้โฟลว์ใหม่ไม่สร้าง cadence อีก */
    const t={id:uuid4(),saleId:sale.id,custId:sale.custId,branch:sale.branch,kind:'งานเดิม',due:TODAY,done:false};TASKS.push(t);
    const n = REQ.length;
    dealTaskDone(t.id);
    const care = CARE.find(x => x.saleId === ids.saleId);
    let ct = null;
    if (care) { ct = care.tasks.find(x => !x.done); if(ct)careTask(care.id, ct.id, 'QA โทรแล้ว'); }
    await __drain();
    const ps = __of(n, 'follow_up_task', 'PATCH');
    return { tk: t.done === true && ps.some(x => x.path.includes(t.id) && x.body.done_at),
      ca: !!care && ps.some(x => ct && x.path.includes(ct.id) && x.body.done_at) };
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
