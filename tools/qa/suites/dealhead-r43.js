/* ด่าน v1.43 — ภาพรวมแบบง่ายเมื่อกดรายลูกค้า (คำสั่งเจ้าของ 27 ส.ค. 2569:
   "หน้าข้อมูลลูกค้า เมื่อกดรายคน อยากให้เห็นข้อมูลโดยรวมแบบง่ายๆแบบนี้เลย" — สไตล์แอปลูกค้า:
   รูปรถใหญ่ · ชิปสถานะ · รุ่น+สี · วันซื้อ · จำนวนรถที่ผูกกับลูกค้า)
   ล็อก:
   [1] ลูกค้าที่มีใบขาย → หัวดีลมี รูปใหญ่ (≥160px) · ชิปวิธีชำระ · ชิปสถานะทะเบียน (ตรง rg.stage)
       · ชื่อ รหัสรุ่น+รุ่น+สี · "ซื้อ <วันที่ พ.ศ.>" · "รถที่ผูกกับลูกค้า N คัน" ตรงจำนวนจริง
   [2] สถานะทะเบียนสื่อด้วยชนิดชิป: ได้ทะเบียนแล้ว = p-good · ยังไม่ได้ = ไม่ใช่ p-good
   [3] ลูกค้าที่ยังไม่มีใบขาย → หน้าไม่พัง ไม่มีคำว่า undefined */
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
  await p.evaluate(() => go('deal')); await p.waitForTimeout(250);

  /* ---------- [1] ลูกค้ามีใบขาย → ภาพรวมครบ ---------- */
  const g1 = await p.evaluate(() => {
    const s = SALES.find(x => !x.void && REGS.some(r => r.saleId === x.id));
    if (!s) return { skip: true };
    DEAL_SEL = s.custId; rDeal();
    const d = dealOf(s.custId);
    const one = document.getElementById('dlOne');
    const ph = [...one.querySelectorAll('.bph')].find(x => x.offsetWidth >= 160);
    const pills = [...one.querySelectorAll('.pill')].map(x => x.textContent.trim());
    const txt = one.textContent;
    const nCars = SALES.filter(x => x.custId === s.custId && !x.void).length;
    return { skip: false,
      bigPh: !!ph,
      payPill: pills.indexOf(dealPay(d)) >= 0,
      regPill: d.rg ? pills.indexOf(d.rg.stage) >= 0 : true,
      title: txt.indexOf(d.u.variant) >= 0 && txt.indexOf(d.u.model) >= 0 && txt.indexOf('สี ' + d.u.color) >= 0,
      bought: txt.indexOf('ซื้อ ' + thDate(s.soldAt)) >= 0,
      cars: txt.indexOf('รถที่ผูกกับลูกค้า ' + nCars + ' คัน') >= 0 };
  });
  if (g1.skip) bad('[1] seed ไม่มีใบขายที่มีงานทะเบียน');
  else {
    if (!g1.bigPh) bad('[1] ไม่มีรูปรถขนาดใหญ่ (≥160px) ในภาพรวม');
    if (!g1.payPill) bad('[1] ไม่มีชิปวิธีชำระ (เงินสด/เงินผ่อน)');
    if (!g1.regPill) bad('[1] ไม่มีชิปสถานะทะเบียนที่ข้อความตรง rg.stage');
    if (!g1.title) bad('[1] ชื่อรถไม่ครบ รหัสรุ่น+รุ่น+สี');
    if (!g1.bought) bad('[1] ไม่มีบรรทัด "ซื้อ <วันที่ พ.ศ.>"');
    if (!g1.cars) bad('[1] ไม่มีบรรทัด "รถที่ผูกกับลูกค้า N คัน" ที่จำนวนตรงจริง');
  }

  /* ---------- [2] ชนิดชิปทะเบียนตามสถานะจริง ---------- */
  const g2 = await p.evaluate(() => {
    const find = ok => { const s = SALES.find(x => !x.void &&
        REGS.some(r => r.saleId === x.id && (r.stage === 'ได้ทะเบียนแล้ว') === ok));
      if (!s) return null;
      DEAL_SEL = s.custId; rDeal();
      const rg = REGS.find(r => r.saleId === s.id);
      const el = [...document.querySelectorAll('#dlOne .pill')].find(x => x.textContent.trim() === rg.stage);
      return el ? { good: el.classList.contains('p-good'), stage: rg.stage } : { missing: rg.stage };
    };
    return { plated: find(true), waiting: find(false) };
  });
  if (!g2.plated) bad('[2] seed ไม่มีเคสได้ทะเบียนแล้ว');
  else if (g2.plated.missing) bad('[2] เคสได้ทะเบียนแล้ว: ไม่เจอชิป "' + g2.plated.missing + '"');
  else if (!g2.plated.good) bad('[2] ชิป "ได้ทะเบียนแล้ว" ไม่ใช่ p-good — สถานะต้องสื่อด้วยชนิดชิป');
  if (!g2.waiting) bad('[2] seed ไม่มีเคสยังไม่ได้ป้าย');
  else if (g2.waiting.missing) bad('[2] เคสรอป้าย: ไม่เจอชิป "' + g2.waiting.missing + '"');
  else if (g2.waiting.good) bad('[2] เคสยังไม่ได้ป้าย แต่ชิปเป็น p-good — สื่อผิดสถานะ');

  /* ---------- [3] ลูกค้ายังไม่มีใบขาย → ไม่พัง ---------- */
  const g3 = await p.evaluate(() => {
    const c = CUSTOMERS.find(x => inScope(x.branch) && !SALES.some(s => s.custId === x.id && !s.void));
    if (!c) return { skip: true };
    DEAL_SEL = c.id; rDeal();
    const txt = document.getElementById('dlOne').textContent;
    const r = { skip: false, undef: txt.indexOf('undefined') >= 0, name: txt.indexOf(c.name) >= 0 };
    DEAL_SEL = ''; rDeal();
    return r;
  });
  if (!g3.skip) {
    if (g3.undef) bad('[3] ลูกค้าไม่มีใบขาย: มีคำว่า undefined ในหน้า');
    if (!g3.name) bad('[3] ลูกค้าไม่มีใบขาย: ไม่เห็นชื่อลูกค้า');
  }

  await b.close();
  if (errors.length) fails.push(...errors);
  if (fails.length) { console.log('FAILS:'); fails.forEach(f => console.log(f)); process.exit(1); }
  console.log('ALL_CHECKS_PASS (dealhead-r43: 3 ข้อ)');
})().catch(e => { console.error('SUITE_CRASH', e); process.exit(2); });
