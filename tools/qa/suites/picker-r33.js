/* ด่าน v1.33 — เลือกรถให้เจอเร็ว (บรีฟรอบ 2 · ข้อ 1 + 11 + B1 + B2)
   เจ้าของสั่ง: สต๊อกเพิ่มตัวกรองรหัสรุ่น · หน้าขายเลือก รุ่น→รหัสรุ่น→สี→เลขตัวถัง
   พร้อมช่องค้นหาที่พิมพ์แล้วเติมช่องข้างบนให้ทันที
   ล็อก:
   [1] สต๊อกมีตัวกรอง #stVariant กรองจริง และผูกกับรุ่นที่เลือก (เลือกรุ่นแล้วเหลือเฉพาะรหัสของรุ่นนั้น)
   [2] B1 · กดการ์ดแกลเลอรีแล้วตารางกรองด้วย "รหัสรุ่นของการ์ด" ไม่ใช่ทั้งชื่อรุ่น
       (v1.43 การ์ดเป็นรายรหัสรุ่น สีเป็นชิปในการ์ด — กดการ์ดได้ทั้งรหัสรุ่น ตรงเลขบนการ์ด)
   [3] B2 · ตัวกรองรุ่นสร้างใหม่ทุกครั้ง + inScope — รับรถรุ่นใหม่แล้วโผล่ทันที · คนสาขาเดียวไม่เห็นรุ่นสาขาอื่น
   [4] หน้าขาย: เลือกรุ่น→รหัส→สี แล้ว #sUnit เหลือเฉพาะคันที่ตรง
   [5] หน้าขาย: พิมพ์เลขถังในช่องค้นหา → รุ่น/รหัส/สี เติมเอง และ #sUnit ชี้คันนั้น
   [6] sUnitSet ล้างตัวกรองก่อนเลือกคันจากภายนอก — คันที่ส่งมาไม่โดนกรองหาย */
const { chromium, EXE, BASE } = require('./env');

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errors = [];
  const bad = m => fails.push(m);
  const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  const login = async id => { await p.goto(BASE + '/index.html');
    await p.click('#lgUsers [data-id="' + id + '"]'); await p.click('#lgGo'); await p.waitForTimeout(400); };
  await login('ST1');

  /* ---------- [1] ตัวกรองรหัสรุ่นในสต๊อก ---------- */
  const g1 = await p.evaluate(() => {
    go('stock'); stTab('table');
    const multi = (() => { const m = {};                       /* หารุ่นที่มีหลายรหัส */
      UNITS.filter(u => inScope(u.branch)).forEach(u => { (m[u.model] = m[u.model] || new Set()).add(u.variant); });
      return Object.keys(m).find(k => m[k].size >= 2); })();
    if (!multi) return { skip: true };
    $('#stModel').value = multi; rStock();
    const opts = [...document.querySelectorAll('#stVariant option')].map(o => o.value).filter(Boolean);
    const wantOpts = [...new Set(UNITS.filter(u => inScope(u.branch) && u.model === multi).map(u => u.variant))];
    $('#stVariant').value = wantOpts[0]; rStock();
    const shown = stList().length;
    const want = UNITS.filter(u => inScope(u.branch) && u.variant === wantOpts[0]).length;
    $('#stModel').value = ''; $('#stVariant').value = ''; rStock();
    return { skip: false, opts: opts.sort().join(','), wantOpts: wantOpts.sort().join(','), shown, want };
  });
  if (g1.skip) bad('[1] seed ไม่มีรุ่นที่มีหลายรหัส — ทดสอบไม่ได้');
  else {
    if (g1.opts !== g1.wantOpts) bad('[1] ตัวเลือกรหัสรุ่นได้ "' + g1.opts + '" ควรเป็น "' + g1.wantOpts + '"');
    if (g1.shown !== g1.want) bad('[1] กรองรหัสรุ่นแล้วได้ ' + g1.shown + ' คัน ควรเป็น ' + g1.want);
  }

  /* ---------- [2] B1 · การ์ดแกลเลอรีตั้งรหัสรุ่น ---------- */
  const g2 = await p.evaluate(() => {
    go('stock'); stTab('gal');
    const card = [...document.querySelectorAll('#stGal [data-gvariant]')]
      .find(c => { const v = c.dataset.gvariant;                 /* หาการ์ดของรุ่นที่มีหลายรหัส */
        return UNITS.some(u => inScope(u.branch) && u.model === c.dataset.gmodel && u.variant !== v); });
    if (!card) return { skip: true };
    const cv = card.dataset.gvariant, cm = card.dataset.gmodel;
    const n = +card.querySelector('.gqty').textContent;
    card.click();
    const shown = stList().length, selV = $('#stVariant').value, selC = $('#stColor').value;
    const wantV = UNITS.filter(u => inScope(u.branch) && u.variant === cv).length;
    const wantM = UNITS.filter(u => inScope(u.branch) && u.model === cm).length;
    $('#stModel').value = ''; $('#stVariant').value = ''; $('#stColor').value = ''; rStock();
    return { skip: false, shown, n, wantV, wantM, cv, selV, selC };
  });
  if (g2.skip) bad('[2] ไม่มีการ์ดของรุ่นหลายรหัสให้ทดสอบ');
  else {
    /* แก่นของ B1: ตัวกรอง "รหัสรุ่น" ต้องถูกตั้งตามการ์ดจริง ๆ ไม่ใช่แค่ชื่อรุ่น —
       เช็คค่าในช่องตรง ๆ เพราะบางสี mutation ที่ถอดการตั้ง variant อาจบังเอิญได้จำนวนเท่ากัน */
    if (g2.selV !== g2.cv) bad('[2] กดการ์ด ' + g2.cv + ' แล้ว #stVariant เป็น "' + g2.selV + '" — ไม่ได้ตั้งรหัสรุ่นตามการ์ด');
    if (g2.selC !== '') bad('[2] กดการ์ด (ไม่ได้จิ้มชิปสี) ไม่ควรตั้งตัวกรองสี (ได้ "' + g2.selC + '")');
    if (g2.shown !== g2.wantV) bad('[2] กดการ์ด ' + g2.cv + ' แล้วได้ ' + g2.shown + ' คัน ควรเป็น ' + g2.wantV + ' (ทั้งรุ่น=' + g2.wantM + ')');
    if (g2.shown !== g2.n) bad('[2] เลขบนการ์ดบอก ' + g2.n + ' คัน แต่กดเข้าไปเจอ ' + g2.shown + ' คัน');
    if (g2.wantV === g2.wantM) bad('[2] เคสทดสอบแยกไม่ออก (รหัสเดียว=ทั้งรุ่น) — เลือกการ์ดใหม่');
  }

  /* ---------- [3] B2 · ตัวกรองรุ่น rebuild + inScope ---------- */
  const g3 = await p.evaluate(() => {
    go('stock');
    const before = [...document.querySelectorAll('#stModel option')].map(o => o.value).filter(Boolean);
    UNITS.push({ id: 'UQA1', model: 'QA-MODEL', variant: 'QA0001', color: 'ดำ', engine: 'QAENG-1',
      frame: 'QAFRAME-1', branch: ME.branch, status: 'available', cost: 1, retail: 2, received: TODAY });
    rStock();
    const after = [...document.querySelectorAll('#stModel option')].map(o => o.value).filter(Boolean);
    UNITS.pop(); rStock();
    return { hadBefore: before.indexOf('QA-MODEL') >= 0, hasAfter: after.indexOf('QA-MODEL') >= 0 };
  });
  if (g3.hadBefore) bad('[3] รุ่นทดสอบโผล่ก่อนเพิ่ม — เทสต์เพี้ยน');
  if (!g3.hasAfter) bad('[3] รับรถรุ่นใหม่แล้วตัวกรองรุ่นไม่อัปเดต (ยัง init ครั้งเดียว)');
  /* คนสาขาเดียวต้องไม่เห็นรุ่นของสาขาอื่น */
  await login('ST6');                                    /* สต๊อก FMM01 — เห็นหน้าสต๊อกและสาขาเดียว */
  const g3b = await p.evaluate(() => {
    go('stock');
    const opts = [...document.querySelectorAll('#stModel option')].map(o => o.value).filter(Boolean);
    const inSc = [...new Set(UNITS.filter(u => inScope(u.branch)).map(u => u.model))];
    const outSc = [...new Set(UNITS.filter(u => !inScope(u.branch)).map(u => u.model))]
      .filter(m => inSc.indexOf(m) < 0);
    return { leak: opts.filter(o => outSc.indexOf(o) >= 0), outN: outSc.length };
  });
  if (g3b.outN === 0) bad('[3] seed ไม่มีรุ่นที่อยู่นอกสาขา ST6 — เทสต์แยกไม่ออก');
  else if (g3b.leak.length) bad('[3] คนสาขาเดียวเห็นรุ่นสาขาอื่นในตัวกรอง: ' + g3b.leak.join(','));

  /* ---------- [4] หน้าขาย: cascade กรอง #sUnit ---------- */
  await login('ST1');
  const g4 = await p.evaluate(() => {
    go('sell');
    const pool = sellPool();
    const multi = (() => { const m = {};
      pool.forEach(u => { (m[u.model] = m[u.model] || new Set()).add(u.variant); });
      return Object.keys(m).find(k => m[k].size >= 2); })();
    if (!multi) return { skip: true };
    $('#svModel').value = multi; $('#svModel').onchange();
    const u0 = pool.find(u => u.model === multi);
    $('#svVariant').value = u0.variant; $('#svVariant').onchange();
    $('#svColor').value = u0.color; $('#svColor').onchange();
    const opts = [...document.querySelectorAll('#sUnit option')].map(o => o.value).filter(Boolean);
    const want = pool.filter(u => u.model === multi && u.variant === u0.variant && u.color === u0.color).map(u => u.id);
    ['svQ','svModel','svVariant','svColor'].forEach(k => $('#' + k).value = ''); rSell();
    return { skip: false, opts: opts.sort().join(','), want: want.sort().join(','), all: pool.length, n: want.length };
  });
  if (g4.skip) bad('[4] ไม่มีรุ่นหลายรหัสในสต๊อกขาย');
  else {
    if (g4.opts !== g4.want) bad('[4] กรองครบสามชั้นแล้ว #sUnit มี "' + g4.opts + '" ควรเป็น "' + g4.want + '"');
    if (g4.n === g4.all) bad('[4] เคสทดสอบแยกไม่ออก — ตัวกรองไม่ได้ตัดอะไรเลย');
  }

  /* ---------- [5] ค้นหาแล้ว back-fill ---------- */
  const g5 = await p.evaluate(() => {
    go('sell');
    const u = sellPool()[0];
    const q = $('#svQ'); q.value = u.frame; q.oninput();
    const r = { m: $('#svModel').value, v: $('#svVariant').value, c: $('#svColor').value,
      unit: $('#sUnit').value, wantId: u.id, wm: u.model, wv: u.variant, wc: u.color };
    q.value = ''; ['svModel','svVariant','svColor'].forEach(k => $('#' + k).value = ''); rSell();
    return r;
  });
  if (g5.m !== g5.wm || g5.v !== g5.wv || g5.c !== g5.wc)
    bad('[5] พิมพ์เลขถังแล้วช่องบนไม่เติม (ได้ ' + g5.m + '/' + g5.v + '/' + g5.c + ')');
  if (g5.unit !== g5.wantId) bad('[5] พิมพ์เลขถังแล้ว #sUnit ไม่ชี้คันนั้น');

  /* ---------- [6] sUnitSet ล้างตัวกรองก่อนเลือก ---------- */
  const g6 = await p.evaluate(() => {
    go('sell');
    const pool = sellPool();
    const a = pool[0], z = pool.find(u => u.model !== a.model) || pool[pool.length - 1];
    $('#svModel').value = a.model; $('#svModel').onchange();     /* กรองไว้คนละรุ่นกับ z */
    sUnitSet(z.id);
    const r = { unit: $('#sUnit').value, want: z.id };
    ['svQ','svModel','svVariant','svColor'].forEach(k => $('#' + k).value = ''); rSell();
    return r;
  });
  if (g6.unit !== g6.want) bad('[6] sUnitSet เลือกคันข้ามตัวกรองไม่ได้ (ได้ ' + g6.unit + ')');

  await b.close();
  if (errors.length) fails.push(...errors);
  if (fails.length) { console.log('FAILS:'); fails.forEach(f => console.log(f)); process.exit(1); }
  console.log('ALL_CHECKS_PASS (picker-r33: 6 ข้อ)');
})().catch(e => { console.error('SUITE_CRASH', e); process.exit(2); });
