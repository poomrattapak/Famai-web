const { chromium, EXE, BASE } = require('./env');
const login = async (p, id) => {
  await p.goto(BASE + '/index.html');
  if (id) await p.click(`#lgUsers [data-id="${id}"]`);
  await p.click('#lgGo'); await p.waitForTimeout(400);
};
(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errs = [];
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));

  // ---------- ผู้จัดการ (ST2) เห็นแท็บตรวจและแก้เวลาได้ ----------
  await login(p, 'ST2');
  await p.evaluate(() => go('hr')); await p.waitForTimeout(400);
  if (!await p.isVisible('#hrTabRv')) fails.push('manager cannot see the review tab');
  const mgrFix = await p.evaluate(() => canFixAtt());
  if (!mgrFix) fails.push('manager still cannot fix attendance (canFixAtt false)');

  await p.click('#hrTabRv'); await p.waitForTimeout(400);
  const q = await p.evaluate(() => {
    const ym = curDate().slice(0, 7);
    const queue = attQueue(ym);
    return { n: queue.length, cards: document.querySelectorAll('#rvTable .crow').length,
      allFlagged: queue.every(x => x.f.length && x.f.some(y => y.k !== 'nophoto')),
      noneReviewed: queue.every(x => !x.a.review),
      sub: document.querySelector('#rvSub').textContent,
      note: document.querySelector('#rvNote').textContent.trim(),
      done: document.querySelectorAll('#rvDone .crow').length };
  });
  if (!q.n) fails.push('review queue is empty — seed produced nothing to review');
  if (q.n > 60) fails.push('review queue is unrealistically large: ' + q.n);
  if (q.cards !== q.n) fails.push(`queue renders ${q.cards} cards for ${q.n} items`);
  if (!q.allFlagged) fails.push('queue contains records with no actionable flag');
  if (!q.noneReviewed) fails.push('queue contains already-reviewed records');
  if (!q.done) fails.push('reviewed-history table is empty');
  if (!q.note) fails.push('review note line empty');

  // ---------- ยืนยันแล้วหลุดคิว + เก็บว่าใครตรวจ ----------
  const okFlow = await p.evaluate(() => {
    const ym = curDate().slice(0, 7);
    const first = attQueue(ym)[0];
    const key = first.s.id + '|' + first.a.date;
    const before = attQueue(ym).length;
    attReview(first.a, 'ok', '');
    const after = attQueue(ym).length;
    return { before, after, by: first.a.review.by, status: first.a.review.status,
      hasAt: !!first.a.review.at, key,
      stillInQueue: attQueue(ym).some(x => x.s.id + '|' + x.a.date === key),
      inDone: attQueue(ym, 1).some(x => x.s.id + '|' + x.a.date === key) };
  });
  if (okFlow.after !== okFlow.before - 1) fails.push('confirm did not remove the item from the queue');
  if (okFlow.stillInQueue) fails.push('confirmed item still in queue');
  if (!okFlow.inDone) fails.push('confirmed item not in the reviewed list');
  if (okFlow.by !== 'ธนพร วัฒนกุล') fails.push('reviewer name not recorded: ' + okFlow.by);
  if (!okFlow.hasAt) fails.push('review timestamp missing');

  // ---------- แผ่นตรวจ: เปิด → ติดปัญหาต้องมีเหตุผล ----------
  await p.evaluate(() => rHr()); await p.waitForTimeout(300);
  /* ต้องเลือกแถวที่ "ไม่ใช่ของตัวเอง" — แถวของตัวเองถูกล็อกไม่ให้ตรวจเอง ปุ่ม OK/ติดปัญหาจึงไม่โผล่
     ต้นเดือน (หรือวันอาทิตย์ที่ร้านปิด) คิวสั้นลงจนแถวแรกอาจเป็นของผู้ตรวจเองพอดี */
  const btn = await (async () => {
    const all = await p.$$('#rvTable [data-rv]');
    const me = await p.evaluate(() => ME.id);
    for (const el of all) {
      const k = await el.getAttribute('data-rv');
      if (k.split('|')[0] !== me) return el;
    }
    return null;
  })();
  if (!btn) fails.push('no ตรวจ button in the queue (ที่ไม่ใช่แถวของผู้ตรวจเอง)');
  else {
    const key = await btn.getAttribute('data-rv');
    await btn.click(); await p.waitForTimeout(500);
    if (!await p.isVisible('#drw.on')) fails.push('person sheet did not open');
    if (!await p.$('#psOk')) fails.push('person sheet missing the confirm button');
    if (!await p.$('#psFix')) fails.push('person sheet missing the fix-time button for a manager');
    if (!await p.$('.calm')) fails.push('person sheet has no month calendar');
    const cells = await p.$$eval('.calm [data-psd]', e => e.length);
    if (cells < 3) fails.push('month calendar rendered ' + cells + ' clickable days');
    // ติดปัญหาโดยไม่ใส่เหตุผล → ต้องไม่บันทึก
    await p.click('#psFlag'); await p.waitForTimeout(300);
    const blocked = await p.evaluate(k => { const [sid, dt] = k.split('|'); return !attOf(sid, dt).review; }, key);
    if (!blocked) fails.push('ติดปัญหา saved without a reason');
    if (!await p.isVisible('#drw.on')) fails.push('sheet closed even though the flag was rejected');
    await p.fill('#psNote', 'มาสายเพราะไปส่งของก่อนเข้างาน');
    await p.click('#psFlag'); await p.waitForTimeout(400);
    const flagged = await p.evaluate(k => { const [sid, dt] = k.split('|'); const r = attOf(sid, dt).review;
      return r && { status: r.status, note: r.note, by: r.by }; }, key);
    if (!flagged || flagged.status !== 'flag') fails.push('flag not saved: ' + JSON.stringify(flagged));
    if (!/ส่งของ/.test(flagged.note || '')) fails.push('flag note not saved');
  }

  // ---------- แก้เวลาแล้วเงินเดือนขยับตาม ----------
  const fix = await p.evaluate(async () => {
    const ym = curDate().slice(0, 7);
    const s = STAFF[0];
    const row = ATT.filter(a => a.staffId === s.id && a.date.slice(0, 7) === ym && a.out && a.date < curDate())[0];
    const beforeOt = prCalc(ym).find(x => x.s.id === s.id).ot;
    attFixModal(s, row.date);
    await new Promise(r => setTimeout(r, 100));
    $('#fxOut').value = '21:00:00';
    $('#fxWhy').value = '';
    $('#fxGo').click();                              // ไม่มีเหตุผล → ต้องไม่บันทึก
    const blocked = row.out !== '21:00:00';
    $('#fxWhy').value = 'อยู่ปิดร้านแทนช่าง';
    $('#fxGo').click();
    const afterOt = prCalc(ym).find(x => x.s.id === s.id).ot;
    return { blocked, beforeOt, afterOt, out: row.out, log: (row.editLog || []).length,
      logBy: row.editLog && row.editLog[0].by, logWhy: row.editLog && row.editLog[0].why };
  });
  if (!fix.blocked) fails.push('edit saved without a reason');
  if (fix.out !== '21:00:00') fails.push('edit did not apply: ' + fix.out);
  if (fix.log !== 1) fails.push('edit log entries = ' + fix.log);
  if (!fix.logBy || !fix.logWhy) fails.push('edit log missing who/why');
  if (fix.afterOt <= fix.beforeOt) fails.push(`OT pay did not rise after extending the day (${fix.beforeOt} -> ${fix.afterOt})`);

  // ---------- badge นับรายการรอตรวจ ----------
  // v1.19: ผู้ตรวจเห็นรวมคำขอออกนอกสถานที่ที่รออนุมัติด้วย (H4) — สูตรตาม set('hr',…) ใน refreshAll
  const badge = await p.evaluate(() => { refreshAll();
    const el = document.querySelector('#tb-hr') || document.querySelector('#bg-hr');
    return { txt: (document.querySelector('#bg-hr') || {}).textContent,
      q: attQueue(curDate().slice(0, 7)).length,
      lv: LEAVES.filter(l => l.status === 'รออนุมัติ').length,
      of: OFFS.filter(o => o.status === 'รออนุมัติ').length }; });
  if (+badge.txt !== badge.q + badge.lv + badge.of)
    fails.push(`hr badge ${badge.txt} != queue ${badge.q} + leaves ${badge.lv} + offsite ${badge.of}`);
  await p.close();

  // ---------- เซลล์ไม่เห็นแท็บตรวจ และแก้เวลาคนอื่นไม่ได้ ----------
  const p2 = await b.newPage({ viewport: { width: 390, height: 844 } });
  p2.on('pageerror', e => errs.push('sales PAGEERROR ' + e.message));
  await login(p2, 'ST3');
  await p2.evaluate(() => go('hr')); await p2.waitForTimeout(400);
  if (await p2.isVisible('#hrTabRv')) fails.push('sales can see the review tab');
  if (await p2.evaluate(() => canFixAtt())) fails.push('sales can fix attendance');
  const salesFix = await p2.$$eval('[data-fix]', e => e.length);
  if (salesFix) fails.push('sales sees แก้ไข buttons');
  const paneOn = await p2.evaluate(() => document.querySelector('#h3').classList.contains('on'));
  if (paneOn) fails.push('review pane visible for sales');
  await p2.close();

  // ---------- HR เห็นคิว แต่เห็นเฉพาะสาขาตัวเองถ้าไม่ใช่ allBranch ----------
  const p3 = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p3.on('pageerror', e => errs.push('hr PAGEERROR ' + e.message));
  await login(p3, 'ST8');
  await p3.evaluate(() => go('hr')); await p3.waitForTimeout(400);
  if (!await p3.isVisible('#hrTabRv')) fails.push('HR cannot see the review tab');
  const scope = await p3.evaluate(() => {
    const q = attQueue(curDate().slice(0, 7));
    return { all: rolePerm().allBranch, branches: [...new Set(q.map(x => x.s.branch))], mine: ME.branch };
  });
  if (!scope.all && scope.branches.some(x => x !== scope.mine))
    fails.push('HR queue leaks other branches: ' + scope.branches);
  await p3.close();

  console.log(fails.length ? 'FAILS:\n' + fails.join('\n') : 'ALL_CHECKS_PASS');
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO_PAGE_ERRORS');
  console.log('queue size:', q.n, '· reviewed:', q.done);
  await b.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})();
