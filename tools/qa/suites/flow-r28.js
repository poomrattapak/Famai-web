/* ด่านของเส้นทางดีล v1.28 — คำสั่งเจ้าของคำต่อคำ:
   "flow คือ คุยกับลูกค้า > ไฟแนนซ์ > เปิดการขาย > ส่งมอบ > ทะเบียนรถ
    เพราะความเป็นจริงคือลูกค้าจะต้องยื่นไฟแนนซ์ผ่าน ร้านถึงจะเปิดการขายได้ ...
    เมื่อส่งมอบรถแล้วลูกค้าก็จะใช้ป้ายชั่วคราวไปก่อนเพื่อรอทะเบียนจริงจากขนส่ง ...
    อยากให้เช็คให้ทุกหน้ามี flow ที่เป็นไปในทางเดียวกันด้วย"

   กติกาที่ล็อกไว้:
   1 ลำดับขั้นตรงตามคำสั่ง                5 ปิดงานทะเบียนไม่ได้ถ้าไม่มีเลขทะเบียน
   2 เดินครบเส้นทางแล้ว k/i ตรงทุกช่วง    6 ส่งมอบ → งานฝ่ายบริการเกิดเอง
   3 ไฟแนนซ์ยังไม่ผ่าน = ยังไม่เปิดการขาย  7 ทุกหน้าเรียงตรงกัน ไม่มีหน้าไหนสวน
   4 ส่งมอบ = จบงาน แต่แถบยังไม่เต็ม      8 หน้าสาธารณะไม่หลุดกฎศักดิ์ศรี */
const { chromium, EXE, BASE } = require('./env');
const WANT = ['คุยกับลูกค้า', 'ไฟแนนซ์', 'เปิดการขาย', 'ส่งมอบ', 'ทะเบียนรถ'];

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errs = [];
  const p = await (await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } })).newPage();
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await p.goto(BASE + '/index.html');
  await p.click('#lgUsers [data-id="ST1"]'); await p.click('#lgGo'); await p.waitForTimeout(700);

  /* 1 · ลำดับขั้นบนจอต้องตรงกับที่เจ้าของสั่งเป๊ะ · เงินสดตัดไฟแนนซ์ออกเหลือ 4 */
  const t1 = await p.evaluate(() => ({
    names: DEAL_TRACK.map(x => x.t),
    keys: DEAL_TRACK.map(x => x.k),
    cash: DEAL_TRACK.filter(x => x.k !== 'fin').map(x => x.t)
  }));
  if (t1.names.join(' > ') !== WANT.join(' > '))
    fails.push('[1] ลำดับขั้นไม่ตรงคำสั่ง: ได้ "' + t1.names.join(' > ') + '"');
  if (t1.keys.indexOf('fin') > t1.keys.indexOf('sale'))
    fails.push('[1] ขั้นไฟแนนซ์อยู่หลังเปิดการขาย — กลับด้านกับงานจริง');
  if (t1.cash.length !== 4) fails.push('[1] เส้นทางเงินสดควรมี 4 ขั้น ได้ ' + t1.cash.length);

  /* 2+3+4+5+6 · เดินดีลผ่อนหนึ่งเส้นด้วยฟังก์ชันจริง แล้วดูทุกช่วง */
  const walk = await p.evaluate(() => {
    /* หาดีลผ่อนที่ยังไม่ส่งมอบและไฟแนนซ์ยังไม่จบ — ดันให้อยู่ต้นทางก่อน */
    const s = SALES.find(x => !x.void && x.pay === 'finance' && FINCASES.some(f => f.saleId === x.id)
      && REGS.some(r => r.saleId === x.id));
    if (!s) return { skip: true };
    const fc = FINCASES.find(f => f.saleId === s.id), rg = REGS.find(r => r.saleId === s.id);
    fc.status = 'รอผล'; delete fc.rejectReason;
    rg.stage = 'ส่งไฟแนนซ์'; rg.hold = ''; rg.plate = ''; delete rg.deliveredAt; delete s.deliveredAt;
    CARE.length = 0;
    const snap = t => { const d = dealOf(s.custId);
      return { t, k: d.k, i: d.i, n: d.track.length, delivered: d.delivered,
        saleTicked: d.i > d.track.findIndex(x => x.k === 'sale'), stage: d.rg.stage }; };
    const out = [snap('รอผลไฟแนนซ์')];
    finAdvance(fc.id);                                   /* รอผล → ติดตามต่อ */
    finAdvance(fc.id);                                   /* → อนุมัติแล้ว */
    out.push(snap('ไฟแนนซ์อนุมัติ'));
    let g = 0;
    while (rg.stage !== 'ส่งมอบแล้ว' && g++ < 8) { if (regAdvance(rg.id) === false) break; }
    const stuck = rg.stage !== 'ส่งมอบแล้ว';
    out.push(snap('ส่งมอบแล้ว'));
    const careN = CARE.filter(c => c.saleId === s.id).length;
    regAdvance(rg.id);                                   /* ส่งมอบแล้ว → รอทะเบียน */
    out.push(snap('รอทะเบียนจริง'));
    const blocked = regAdvance(rg.id) === false && rg.stage === 'รอทะเบียน';  /* ไม่มีเลขทะเบียน = ปิดไม่ได้ */
    regAdvance(rg.id, '1กก 9999');
    out.push(snap('ได้ทะเบียนแล้ว'));
    return { out, careN, blocked, stuck };
  });
  if (walk.skip) fails.push('[2] ไม่มีดีลผ่อนใน seed ให้เดินเส้นทาง');
  else if (walk.stuck) fails.push('[2] เดินไปถึงขั้นส่งมอบไม่ได้ — ลำดับขั้นทะเบียนขวางอยู่');
  else {
    const by = {}; walk.out.forEach(x => by[x.t] = x);
    const chk = (t, want) => { const g = by[t]; if (!g) { fails.push('[2] ไม่มีช่วง "' + t + '"'); return; }
      for (const key of Object.keys(want)) if (g[key] !== want[key])
        fails.push('[2] ช่วง "' + t + '" ' + key + ' = ' + JSON.stringify(g[key]) + ' ควรเป็น ' + JSON.stringify(want[key])); };
    chk('รอผลไฟแนนซ์',  { k: 'fin',     i: 1, delivered: false, saleTicked: false });
    chk('ไฟแนนซ์อนุมัติ', { k: 'deliver', i: 3, delivered: false, saleTicked: true });
    chk('ส่งมอบแล้ว',    { k: 'plate',   i: 4, delivered: true });
    chk('ได้ทะเบียนแล้ว', { k: 'done',    i: 5, delivered: true });
    /* 3 · แก่นของคำสั่ง — ไฟแนนซ์ยังไม่ผ่าน ห้ามติ๊กขั้นเปิดการขาย */
    if (by['รอผลไฟแนนซ์'] && by['รอผลไฟแนนซ์'].saleTicked)
      fails.push('[3] ไฟแนนซ์ยังไม่ผ่านแต่ขั้น "เปิดการขาย" ถูกติ๊กแล้ว');
    /* 4 · ส่งมอบ = จบงาน แต่แถบต้องยังไม่เต็ม (ป้ายจริงยังไม่มา) */
    const dl = by['ส่งมอบแล้ว'];
    if (dl && dl.i >= dl.n) fails.push('[4] ส่งมอบแล้วแถบเต็มทันทีทั้งที่ยังไม่ได้ป้ายจริง');
    if (dl && !dl.delivered) fails.push('[4] ส่งมอบแล้วแต่ไม่ถูกนับว่าจบงาน');
    /* 5 · ด่านเลขทะเบียน */
    if (!walk.blocked) fails.push('[5] ปิดงานทะเบียนได้ทั้งที่ยังไม่มีเลขทะเบียน');
    /* 6 · ส่งมอบแล้วงานฝ่ายบริการต้องเกิด แม้ส่งมอบไม่ใช่ขั้นสุดท้ายแล้ว */
    if (!walk.careN) fails.push('[6] ส่งมอบแล้วงานฝ่ายบริการไม่เกิด');
  }

  /* 7 · ทุกหน้าเรียงตรงกัน — ทะเบียน / ผังกระบวนการ / หน้าสาธารณะ */
  const t7 = await p.evaluate(() => {
    const iR = x => REG_STAGES.indexOf(x);
    const lane = n => (LANES.find(l => l.n === n) || { s: [] }).s.map(x => x.replace(/[+!]/g, '').trim());
    const sell = lane('เซลล์'), reg = lane('ทะเบียน');
    const idx = (arr, kw) => arr.findIndex(x => x.indexOf(kw) >= 0);
    return {
      regOrder: REG_STAGES.slice(),
      dlvBeforePlate: iR('ส่งมอบแล้ว') < iR('ได้ทะเบียนแล้ว'),
      noWhitePlate: iR('ป้ายขาว') < 0,
      sellFinFirst: idx(sell, 'ส่งเรื่องไฟแนนซ์') >= 0 && idx(sell, 'ส่งเรื่องไฟแนนซ์') < idx(sell, 'เปิดการขาย'),
      regDlvFirst: idx(reg, 'ส่งมอบ') < idx(reg, 'รับป้าย'),
      pubKeys: Object.keys(PUB_STEP).sort().join(','),
      trackKeys: DEAL_TRACK.map(x => x.k).concat('done').sort().join(',')
    };
  });
  if (!t7.dlvBeforePlate) fails.push('[7] ขั้นทะเบียน: ส่งมอบไม่ได้มาก่อนได้ป้าย — ' + t7.regOrder.join(' → '));
  if (!t7.noWhitePlate)   fails.push('[7] ยังมีขั้น "ป้ายขาว" ค้างอยู่ใน REG_STAGES');
  if (!t7.sellFinFirst)   fails.push('[7] ผังกระบวนการ lane เซลล์: ไฟแนนซ์ไม่ได้มาก่อนเปิดการขาย');
  if (!t7.regDlvFirst)    fails.push('[7] ผังกระบวนการ lane ทะเบียน: ส่งมอบไม่ได้มาก่อนรับป้าย');
  if (t7.pubKeys !== t7.trackKeys)
    fails.push('[7] หน้าสาธารณะมีขั้นไม่ตรงกับ DEAL_TRACK: ' + t7.pubKeys + ' ≠ ' + t7.trackKeys);

  /* 8 · กฎศักดิ์ศรีหน้าสาธารณะ — ห้ามหลุดตอนรื้อเส้นทาง */
  const t8 = await p.evaluate(() => {
    const s = SALES.find(x => !x.void && FINCASES.some(f => f.saleId === x.id));
    if (!s) return null;
    const fc = FINCASES.find(f => f.saleId === s.id);
    fc.status = 'ปฏิเสธ'; fc.rejectReason = 'ติดไฟแนนซ์เจ้าอื่น'; fc.rejectWith = 'SCB';
    const o = pubOrder(s.custId);
    return { status: o.status, blob: JSON.stringify(o) };
  });
  if (!t8) fails.push('[8] ไม่มีเคสสินเชื่อให้ทดสอบหน้าสาธารณะ');
  else {
    if (t8.status !== 'กรุณาติดต่อร้าน') fails.push('[8] เคสไม่ผ่านหน้าสาธารณะขึ้นว่า "' + t8.status + '"');
    for (const w of ['ไม่ผ่าน', 'ปฏิเสธ', 'SCB', 'ติดไฟแนนซ์'])
      if (t8.blob.indexOf(w) >= 0) fails.push('[8] หน้าสาธารณะหลุดคำว่า "' + w + '"');
  }
  await p.context().close();

  console.log(fails.length ? 'FAILS:\n' + fails.join('\n') : 'ALL_CHECKS_PASS');
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})();
