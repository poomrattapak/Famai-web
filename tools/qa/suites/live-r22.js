/* ด่าน QA รอบส่งมอบ (v1.22) — โหมดข้อมูลจริงต้องไม่ทำคิวพังถาวร (poison queue)
   จำลอง LIVE ด้วยการ stub sbFetch/sbUpload ในหน้า — พิสูจน์ที่ "สิ่งที่ถูกส่งจริง" ไม่ใช่แค่ตัวแปร */
const { chromium, EXE, BASE } = require('./env');

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errors = [];
  const bad = m => fails.push(m);
  const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await p.goto(BASE + '/index.html');
  await p.click('#lgUsers [data-id="ST1"]'); await p.click('#lgGo'); await p.waitForTimeout(400);

  /* stub ชั้นเน็ตเวิร์กทั้งหมด — REQ เก็บทุกคำขอที่ "จะ" ยิงจริง */
  await p.evaluate(() => {
    window.REQ = []; window.FAIL_ALL = false;
    sbFetch = async (path, opt) => {
      REQ.push({ path, method: (opt && opt.method) || 'GET', body: opt && opt.body ? JSON.parse(opt.body) : null });
      if (FAIL_ALL) throw new Error('23505 duplicate key (จำลอง)');
      return {};
    };
    sbUpload = async () => 'x';
    LIVE = true;
  });

  /* 1 · dbId ต้องได้ uuid เสมอ — แม้ browser ไม่มี crypto.randomUUID (http บน LAN) */
  const t1 = await p.evaluate(() => {
    const a = dbId();
    const saved = crypto.randomUUID;
    try { Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true }); }
    catch (_) { return { skip: 'เบราว์เซอร์นี้ล็อก crypto' }; }
    const b2 = dbId();
    Object.defineProperty(crypto, 'randomUUID', { value: saved, configurable: true });
    const re = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return { a: re.test(a), b: re.test(b2) };
  });
  if (t1.skip) bad('ข้าม dbId: ' + t1.skip);
  else {
    if (!t1.a) bad('dbId ปกติไม่ใช่ uuid');
    if (!t1.b) bad('ไม่มี crypto.randomUUID แล้ว dbId ไม่ใช่ uuid (id:null = คิวตายทั้งเส้น)');
  }

  /* 2 · ด่านกลาง: id เดโมห้ามหลุดเข้าคิว — ทั้ง upsert และ delete */
  const t2 = await p.evaluate(() => {
    const n = REQ.length;
    dbUp('company_holiday', { id: 'HO1', on_date: curDate(), name: 'x' });
    dbDel('company_event', 'id=eq.EV1');
    const blocked = REQ.length === n;
    dbUp('company_holiday', { id: uuid4(), on_date: curDate(), name: 'x' }, 'on_date');
    const passed = REQ.length === n + 1 && REQ[n].path.includes('on_conflict=on_date');
    return { blocked, passed };
  });
  if (!t2.blocked) bad('id เดโม (HO1/EV1) หลุดเข้าคิว — 22P02 คิวตายถาวร');
  if (!t2.passed)  bad('id uuid จริงกลับถูกข้าม หรือวันหยุดไม่ใช้ on_conflict=on_date');

  /* 3 · คำตัดสินต้องเป็น PATCH ไม่ใช่ upsert — แถวที่ไม่มีจริงต้องเงียบ ไม่ระเบิด not null
     (คิว flush เป็น async — ต้องรอคิวระบายก่อนตรวจ REQ) */
  const t3 = await p.evaluate(async () => {
    const drain = () => new Promise(r => { const k = () => (DB_Q.length || DB_RUN) ? setTimeout(k, 30) : r(); k(); });
    const lid = uuid4();
    LEAVES.push({ id: lid, staffId: 'ST6', type: 'ลากิจ', from: addDays(curDate(), 70),
      to: addDays(curDate(), 70), status: 'รออนุมัติ' });
    const n = REQ.length;
    lvDecide(lid, false, 'ทดสอบ');
    await drain();
    const r = REQ.slice(n).find(x => x.path.includes('leave_request'));
    const patched = !!r && r.method === 'PATCH' && r.path.includes('id=eq.' + lid)
      && r.body && r.body.status === 'ไม่อนุมัติ' && !('employee_id' in r.body);
    /* การเงินตรวจการขาย — PATCH เช่นกัน */
    const s = SALES.find(x => !x.void); s.id2 = s.id;
    const sid = uuid4(); s.id = sid; s.finApproval = { status: 'รอตรวจ' };
    const n2 = REQ.length;
    finApprove(sid, true);
    await drain();
    const r2 = REQ.slice(n2).find(x => x.path.includes('/sale?'));
    const finPatched = !!r2 && r2.method === 'PATCH';
    s.id = s.id2;
    return { patched, finPatched };
  });
  if (!t3.patched)    bad('lvDecide ไม่ใช่ PATCH หรือพ่วงคอลัมน์เกิน — แถวไม่มีจริงจะระเบิด 23502');
  if (!t3.finPatched) bad('finApprove ไม่ใช่ PATCH');

  /* 4 · รับรถโหมดจริงต้องลงฐาน — id uuid + FK uuid (เดิมรถอยู่แค่ในเครื่อง ขายต่อ = FK พัง) */
  const t4 = await p.evaluate(() => {
    VARIANT_IDS[Object.keys(PRICE)[0]] = uuid4();
    BR_IDS['FMG01'] = BR_IDS['FMG01'] || uuid4();
    go('recv');
    $('#rVariant').value = Object.keys(PRICE)[0];
    $('#rVariant').onchange && $('#rVariant').onchange();
    const cc = Object.keys(PRICE[$('#rVariant').value].c)[0];
    $('#rColor').innerHTML = '<option value="' + cc + '">x</option>'; $('#rColor').value = cc;
    $('#rBranch').innerHTML = '<option value="FMG01">x</option>'; $('#rBranch').value = 'FMG01';
    $('#rEngine').value = 'QA-ENG-22'; $('#rFrame').value = 'QA-FRM-22';
    const n = REQ.length;
    saveRecv();
    if ($('#cfmGo')) $('#cfmGo').onclick();
    const r = REQ.slice(n).find(x => x.path.includes('motorcycle_unit'));
    const re = /^[0-9a-f]{8}-/;
    return { sent: !!r, uuidOk: r && re.test(r.body.id) && re.test(r.body.branch_id) && re.test(r.body.variant_id),
      unitInApp: UNITS.some(u => u.engine === 'QA-ENG-22' && re.test(u.id)) };
  });
  if (!t4.sent)     bad('รับรถโหมดจริงไม่ยิง motorcycle_unit ลงฐาน');
  if (!t4.uuidOk)   bad('รับรถส่ง id/FK ที่ไม่ใช่ uuid');
  if (!t4.unitInApp) bad('รถในแอปได้ id ที่ไม่ใช่ uuid — ขายต่อจะพัง FK');

  /* 5 · public_token ต้องไปกับ sale — ลิงก์ติดตามที่พิมพ์ให้ลูกค้าต้องใช้ได้จริง */
  const t5 = await p.evaluate(async () => {
    const drain = () => new Promise(r => { const k = () => (DB_Q.length || DB_RUN) ? setTimeout(k, 30) : r(); k(); });
    const u = UNITS.find(x => x.status === 'available' && x.retail != null && /^[0-9a-f]{8}-/.test(x.id) && x.branch === 'FMG01');
    if (!u) return { skip: 'ไม่มีรถ uuid ว่าง (ใช้คันที่เพิ่งรับเข้า)' };
    go('sell');
    $('#sUnit').innerHTML = '<option value="' + u.id + '">x</option>'; $('#sUnit').value = u.id;
    $('#sBranch').innerHTML = '<option value="' + u.branch + '">x</option>'; $('#sBranch').value = u.branch;
    $('#sCust').value = 'ทดสอบ โทเคน'; $('#sPay').value = 'cash';
    const n = REQ.length;
    saveSale();
    if ($('#cfmGo')) $('#cfmGo').onclick();
    await drain();
    const r = REQ.slice(n).find(x => x.path.includes('/sale?'));
    const s = SALES[SALES.length - 1];
    return { sent: !!r, tok: r && r.body.public_token && r.body.public_token === s.pubToken };
  });
  if (t5.skip) bad('ข้าม token: ' + t5.skip);
  else {
    if (!t5.sent) bad('ขายโหมดจริงไม่ยิง sale ลงฐาน');
    if (!t5.tok)  bad('public_token ไม่ถูกส่งลงฐาน — ลิงก์ติดตามที่พิมพ์ให้ลูกค้าจะใช้ไม่ได้');
  }

  /* 6 · คิวห้ามตายถาวร: งานพังซ้ำ 5 ครั้ง → ย้ายเข้า DB_DEAD แล้วงานถัดไปเดินต่อ */
  const t6 = await p.evaluate(async () => {
    DB_Q.length = 0; DB_DEAD.length = 0; DB_ERRN = 0;
    if (DB_T) { clearTimeout(DB_T); DB_T = null; }
    FAIL_ALL = true;
    dbUp('app_setting', { key: 'qa', value: {} }, 'key');          /* งานหัวคิวที่จะพังตลอด */
    dbUp('app_setting', { key: 'qa2', value: {} }, 'key');         /* งานถัดไปที่ต้องรอด */
    /* เร่งเวลา: บังคับ flush ซ้ำแทนรอ 8 วิ × 5 */
    for (let i = 0; i < 6; i++) {
      if (DB_T) { clearTimeout(DB_T); DB_T = null; }
      await dbFlush();
      await new Promise(r => setTimeout(r, 20));
    }
    const deadHas = DB_DEAD.length === 1 && DB_DEAD[0].body.key === 'qa';
    FAIL_ALL = false;
    if (DB_T) { clearTimeout(DB_T); DB_T = null; }
    await dbFlush();
    await new Promise(r => setTimeout(r, 20));
    const nextRan = DB_Q.length === 0 && REQ.some(x => x.body && x.body.key === 'qa2');
    return { deadHas, nextRan };
  });
  if (!t6.deadHas) bad('งานที่พังถาวรไม่ถูกย้ายเข้า DB_DEAD หลัง 5 ครั้ง (คิวค้างตลอดกาล)');
  if (!t6.nextRan) bad('ทิ้งงานพังแล้วงานถัดไปไม่เดินต่อ');

  await p.evaluate(() => { LIVE = false; });

  console.log(fails.length ? 'FAILS:\n' + [...new Set(fails)].join('\n') : 'ALL_CHECKS_PASS');
  console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})();
