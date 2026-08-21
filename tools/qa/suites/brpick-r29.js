/* ด่านของแผงเลือกขอบเขต บริษัท → สาขา v1.29 — คำสั่งเจ้าของ:
   "ตรงปุ่มให้เลือกสาขาบน navbar ตอนนี้เหมือนเป็นให้เลือกบริษัทมากกว่า ... โฟลวคือ
    กดแล้วจะให้เลือกบริษัทก่อน แล้วจะมีสาขาให้เลือกและสามารถบันทึกได้
    หรือกดแค่บริษัทก็บันทึกได้เช่นกัน"

   กติกาที่ล็อก:
   1 กดปุ่ม → เห็นบริษัทก่อน ยังไม่มีสาขา      5 เลือกแล้วยังไม่ยืนยัน = ข้อมูลยังไม่เปลี่ยน
   2 กดบริษัท → กางสาขาของบริษัทนั้นเท่านั้น    6 ทุกหน้ากรองด้วย brMatch ตัวเดียวกัน
   3 บันทึกระดับบริษัท = รวมทุกสาขาในบริษัท     7 390 ไม่ล้นจอ · Escape คืนค่าเดิม
   4 บันทึกระดับสาขา = เหลือสาขาเดียว           8 ไม่มีตัวกรองสาขาในหน้าอีกแล้ว */
const { chromium, EXE, BASE } = require('./env');

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errs = [];
  const login = async (pg) => { await pg.goto(BASE + '/index.html');
    await pg.click('#lgUsers [data-id="ST1"]'); await pg.click('#lgGo'); await pg.waitForTimeout(700); };

  const p = await (await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } })).newPage();
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await login(p);

  /* ข้อมูลสาธิตต้องมีบริษัทที่มีมากกว่าหนึ่งสาขา ไม่งั้นสองชั้นพิสูจน์อะไรไม่ได้เลย */
  const shape = await p.evaluate(() => ({
    cos: COMPANIES.length,
    multi: COMPANIES.filter(c => BRANCHES.filter(b => b.co === c.id).length > 1).length,
    brs: BRANCHES.length
  }));
  if (shape.multi < 1) fails.push('[0] ไม่มีบริษัทไหนมีมากกว่าหนึ่งสาขา — ตัวเลือกสองชั้นไม่มีความหมาย');

  /* 1 · กดปุ่ม → ชั้นบริษัทก่อน */
  await p.click('#navBrBtn'); await p.waitForTimeout(300);
  const t1 = await p.evaluate(() => ({
    open: getComputedStyle($('#brPick')).display !== 'none',
    co: document.querySelectorAll('#brPick [data-bpco]').length,
    br: document.querySelectorAll('#brPick [data-bpbr]').length,
    all: !!document.querySelector('#brPick [data-bpall]')
  }));
  if (!t1.open) fails.push('[1] กดปุ่มแล้วแผงไม่เปิด');
  if (!t1.co)   fails.push('[1] แผงไม่มีรายชื่อบริษัทให้เลือก');
  if (t1.br)    fails.push('[1] เปิดมาก็เห็นสาขาเลย ' + t1.br + ' รายการ — ต้องเลือกบริษัทก่อน');
  if (!t1.all)  fails.push('[1] ไม่มีตัวเลือก "ทุกสาขาที่เห็นได้" ให้ล้างตัวกรอง');

  /* 2 · กดบริษัท → กางเฉพาะสาขาของบริษัทนั้น */
  const co = await p.evaluate(() => {
    const c = COMPANIES.find(x => BRANCHES.filter(b => b.co === x.id).length > 1) || COMPANIES[0];
    return { id: c.id, n: BRANCHES.filter(b => b.co === c.id).length };
  });
  await p.click('#brPick [data-bpco="' + co.id + '"]'); await p.waitForTimeout(250);
  const t2 = await p.evaluate(cid => ({
    shown: [...document.querySelectorAll('#brPick [data-bpbr]')].map(e => e.dataset.bpbr),
    mine: BRANCHES.filter(b => b.co === cid).map(b => b.code),
    staged: NAV_BRP, stillOpen: getComputedStyle($('#brPick')).display !== 'none'
  }), co.id);
  if (t2.shown.join(',') !== t2.mine.join(','))
    fails.push('[2] กางสาขาไม่ตรงบริษัทที่กด: [' + t2.shown + '] ควรเป็น [' + t2.mine + ']');
  if (t2.staged !== co.id) fails.push('[2] กดบริษัทแล้วไม่ได้เลือกระดับบริษัทไว้ (staged=' + t2.staged + ')');
  if (!t2.stillOpen)       fails.push('[2] กดบริษัทแล้วแผงปิดทันที — ต้องเปิดค้างให้เลือกสาขาต่อได้');

  /* 5 · ยังไม่กดยืนยัน ข้อมูลต้องยังไม่เปลี่ยน (กติกา v1.27.1 ห้ามหลุด) */
  const t5 = await p.evaluate(() => ({ page: $('#dBranch').value, units: dUnits().length }));
  if (t5.page === co.id) fails.push('[5] เลือกบริษัทแล้วลงที่หน้าทันที ทั้งที่ยังไม่กดยืนยัน');

  /* 3 · ยืนยันระดับบริษัท → รวมทุกสาขาในบริษัทนั้น */
  const all = await p.evaluate(() => { brPickClose(); $('#dBranch').value = ''; dBranch = ''; return dUnits().length; });
  await p.click('#navBrBtn'); await p.waitForTimeout(200);
  await p.click('#brPick [data-bpco="' + co.id + '"]'); await p.waitForTimeout(200);
  /* ปุ่มยืนยันถูก disable = ไม่มีอะไรถูกพัก — ต้องแดงสะอาด ไม่ใช่รอจนหมดเวลา */
  if (await p.evaluate(() => $('#navOk').disabled)) {
    fails.push('[3] กดบริษัทแล้วปุ่มยืนยันยังกดไม่ได้ — ไม่ได้พักค่าไว้');
  } else { await p.click('#navOk'); await p.waitForTimeout(400); }
  const t3 = await p.evaluate(cid => {
    const want = UNITS.filter(u => (BRANCHES.find(b => b.code === u.branch) || {}).co === cid
      && u.status !== 'sold').length;
    return { page: $('#dBranch').value, units: dUnits().length, want,
      lbl: $('#navBrLbl').textContent, closed: getComputedStyle($('#brPick')).display === 'none' };
  }, co.id);
  if (t3.page !== co.id)   fails.push('[3] ยืนยันแล้วหน้าไม่ได้ถูกตั้งเป็นระดับบริษัท (' + t3.page + ')');
  if (t3.units !== t3.want) fails.push('[3] ระดับบริษัทนับได้ ' + t3.units + ' ควรเป็น ' + t3.want + ' (ทุกสาขารวมกัน)');
  if (!(t3.units < all))   fails.push('[3] ระดับบริษัทไม่ได้น้อยกว่าทั้งหมด (' + t3.units + ' vs ' + all + ')');
  if (!t3.closed)          fails.push('[3] กดยืนยันแล้วแผงยังค้างเปิด');

  /* 4 · ยืนยันระดับสาขา → เหลือสาขาเดียว และน้อยกว่าระดับบริษัท */
  const brCode = await p.evaluate(cid => { brPickClose(); return BRANCHES.filter(b => b.co === cid)[1].code; }, co.id);
  await p.click('#navBrBtn'); await p.waitForTimeout(200);
  await p.click('#brPick [data-bpco="' + co.id + '"]'); await p.waitForTimeout(200);
  await p.click('#brPick [data-bpbr="' + brCode + '"]'); await p.waitForTimeout(200);
  const closedOnBranch = await p.evaluate(() => getComputedStyle($('#brPick')).display === 'none');
  if (!closedOnBranch) fails.push('[4] เลือกสาขาแล้วแผงไม่ปิด');
  if (await p.evaluate(() => $('#navOk').disabled)) {
    fails.push('[4] เลือกสาขาแล้วปุ่มยืนยันยังกดไม่ได้');
  } else { await p.click('#navOk'); await p.waitForTimeout(400); }
  const t4 = await p.evaluate(code => ({
    page: $('#dBranch').value, units: dUnits().length,
    want: UNITS.filter(u => u.branch === code && u.status !== 'sold').length,
    lbl: $('#navBrLbl').textContent, name: bName(code)
  }), brCode);
  if (t4.page !== brCode)   fails.push('[4] ยืนยันสาขาแล้วหน้าไม่ได้ถูกตั้งเป็นสาขานั้น (' + t4.page + ')');
  if (t4.units !== t4.want) fails.push('[4] ระดับสาขานับได้ ' + t4.units + ' ควรเป็น ' + t4.want);
  if (!(t4.units <= t3.units)) fails.push('[4] สาขาเดียวไม่ได้น้อยกว่าหรือเท่ากับทั้งบริษัท');
  if (t4.lbl.indexOf(t4.name) < 0) fails.push('[4] ป้ายปุ่มไม่ตรงกับสาขาที่เลือก: "' + t4.lbl + '"');

  /* 6 · ทุกหน้าใช้ brMatch ตัวเดียวกัน — ขอบเขตเดียวกันต้องให้ผลสอดคล้องกัน */
  const t6 = await p.evaluate(cid => {
    const codes = BRANCHES.filter(b => b.co === cid).map(b => b.code);
    return { coHit: codes.every(c => brMatch(cid, c)),
      otherMiss: BRANCHES.filter(b => b.co !== cid).every(b => !brMatch(cid, b.code)),
      brOnly: brMatch(codes[0], codes[0]) && !brMatch(codes[0], codes[1]),
      allPass: BRANCHES.every(b => brMatch('', b.code)) };
  }, co.id);
  if (!t6.coHit)     fails.push('[6] brMatch ระดับบริษัทไม่รับสาขาของตัวเองครบ');
  if (!t6.otherMiss) fails.push('[6] brMatch ระดับบริษัทรับสาขาของบริษัทอื่นด้วย');
  if (!t6.brOnly)    fails.push('[6] brMatch ระดับสาขาไม่ได้จำกัดเหลือสาขาเดียว');
  if (!t6.allPass)   fails.push('[6] ค่าว่างควรผ่านทุกสาขา');

  /* 8 · ตัวกรองสาขาในหน้าต้องไม่โผล่แล้ว — navbar เป็นที่เดียว */
  const t8 = await p.evaluate(() => {
    const out = [];
    [['dash', 'dBranch'], ['stock', 'stBranch'], ['deal', 'dlBranch'], ['report', 'rpBranch']].forEach(([pg, id]) => {
      go(pg); const e = document.querySelector('#' + id);
      if (e && e.offsetParent) out.push(pg + '/' + id);
    });
    go('dash');
    return out;
  });
  if (t8.length) fails.push('[8] ยังมีตัวกรองสาขาโผล่ในหน้า: ' + t8.join(' · '));
  await p.context().close();

  /* 7 · 390: ไม่ล้นจอ · ปิดด้วย Escape แล้วคืนค่าเดิม */
  const m = await (await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 390, height: 844 } })).newPage();
  m.on('pageerror', e => errs.push('PAGEERROR(390) ' + e.message));
  await login(m);
  await m.click('#npBtn'); await m.waitForTimeout(250);
  await m.click('#navBrBtn'); await m.waitForTimeout(300);
  const t7 = await m.evaluate(cid => {
    const before = dUnits().length;
    document.querySelector('#brPick [data-bpco="' + cid + '"]').click();
    return { before, sw: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
      w: Math.round($('#brPick').getBoundingClientRect().width) };
  }, co.id);
  if (t7.sw > 390) fails.push('[7] 390: เปิดแผงแล้วจอเลื่อนซ้าย-ขวาได้ (' + t7.sw + 'px)');
  if (t7.w > 390)  fails.push('[7] 390: แผงกว้าง ' + t7.w + 'px เกินจอ');
  await m.keyboard.press('Escape'); await m.waitForTimeout(300);
  const rev = await m.evaluate(() => ({ units: dUnits().length, page: $('#dBranch').value,
    open: getComputedStyle($('#brPick')).display !== 'none' }));
  if (rev.open)                 fails.push('[7] 390: Escape แล้วแผงไม่ปิด');
  if (rev.page)                 fails.push('[7] 390: ปิดโดยไม่ยืนยันแล้วขอบเขตกลับลงที่หน้า');
  if (rev.units !== t7.before)  fails.push('[7] 390: ปิดโดยไม่ยืนยันแล้วข้อมูลถูกกรองไปแล้ว');
  await m.context().close();

  console.log(fails.length ? 'FAILS:\n' + fails.join('\n') : 'ALL_CHECKS_PASS');
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})();
