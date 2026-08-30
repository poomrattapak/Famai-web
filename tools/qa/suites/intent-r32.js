/* ด่าน v1.32 — ระบบรู้เงินสด/ผ่อนตั้งแต่ก่อนเปิดใบขาย (บรีฟรอบ 2 · เรื่องที่ 1)
   เจ้าของสั่ง: ปุ่มบนแถบต้องตรงกับขั้นที่แถบชี้ · แยกลูกค้าเงินสด/ผ่อนจากหน้ารวม ·
   แก้บั๊กลูกค้าเงินผ่อนเข้าหน้าขายแล้วช่องเงินผ่อนไม่ขึ้น · ลูกค้าใหม่ห้ามถูกยัดรุ่น FINN
   ล็อก:
   [1] B3 · เพิ่มลูกค้าใหม่โดยไม่เลือกรุ่น → c.variant ต้องว่าง ไม่ใช่รุ่นแรกของตารางราคา
   [2] ดีลไม่มีใบขาย + สนใจเงินสด → แถบไม่มีขั้นไฟแนนซ์ (3 ขั้น) · สนใจผ่อน/ไม่ระบุ → มี (4 ขั้น · v1.34)
   [3] ปุ่มขั้น lead อ่าน intent — เงินสดเห็น "เปิดการขาย" · ผ่อนเห็น "ยื่นไฟแนนซ์"
   [4] บั๊กข้อ 27 · dealSell ลูกค้าเงินผ่อน → #sPay=finance และกล่อง #sFinBox+#sFinPay เปิดทั้งคู่
   [5] setPay เป็นทางเดียว — จากตารางเทียบค่างวด (data-pick) กล่องทั้งสองก็ต้องเปิด
   [6] ตารางรวมมี pill เงินสด/ผ่อน + ตัวกรอง #dlPay กรองจริง
   [7] dealProceedSave ครบทุกช่อง → บันทึกลง c.* และพาไปหน้าขายพร้อมวิธีชำระที่ถูก */
const { chromium, EXE, BASE } = require('./env');

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errors = [];
  const bad = m => fails.push(m);
  const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await p.goto(BASE + '/index.html');
  await p.click('#lgUsers [data-id="ST1"]'); await p.click('#lgGo'); await p.waitForTimeout(500);

  /* ---------- [1] B3 ---------- */
  const b3 = await p.evaluate(() => {
    go('deal'); custModal();
    const opt0 = document.querySelector('#cmModel option');
    const selVal = document.querySelector('#cmModel').value;
    document.querySelector('#cmName').value = 'QA ทดสอบรุ่น';
    document.querySelector('#cmGo').click();
    const c = CUSTOMERS.find(x => x.name === 'QA ทดสอบรุ่น');
    const varSaved = c ? c.variant : '(ไม่ได้บันทึก)';
    if (c) CUSTOMERS.splice(CUSTOMERS.indexOf(c), 1);
    return { firstBlank: opt0 && opt0.value === '', selVal, varSaved };
  });
  if (!b3.firstBlank) bad('[1] ตัวเลือกแรกของรุ่นที่สนใจไม่ใช่ "ยังไม่ระบุ"');
  if (b3.selVal !== '') bad('[1] ค่าเริ่มต้นของ #cmModel คือ "' + b3.selVal + '" ควรว่าง');
  if (b3.varSaved !== '') bad('[1] ลูกค้าใหม่ถูกบันทึกรุ่น "' + b3.varSaved + '" ทั้งที่ไม่ได้เลือก');

  /* ---------- [2]+[3] เส้นทาง/ปุ่มตาม intent ---------- */
  const g23 = await p.evaluate(() => {
    const c = CUSTOMERS.find(x => !SALES.some(y => y.custId === x.id && !y.void));
    if (!c) return { skip: true };
    const keep = c.intent, out = {};
    for (const it of ['เงินสด', 'เงินผ่อน', 'ยังไม่ระบุ']) {
      c.intent = it;
      const d = dealOf(c.id);
      DEAL_SEL = c.id; rDeal();
      const btn = document.querySelector('#dlOne [data-dlgo]');
      out[it] = { n: d.track.length, hasFin: d.track.some(x => x.k === 'fin'),
        btn: btn ? btn.textContent.trim() : '(ไม่มีปุ่ม)' };
    }
    c.intent = keep; DEAL_SEL = ''; rDeal();
    return { skip: false, out };
  });
  if (g23.skip) bad('[2] ไม่มีลูกค้าที่ยังไม่เปิดใบขายใน seed');
  else {
    const o = g23.out;
    if (o['เงินสด'].hasFin || o['เงินสด'].n !== 3) bad('[2] สนใจเงินสดแต่แถบมีขั้นไฟแนนซ์ (' + o['เงินสด'].n + ' ขั้น)');
    if (!o['เงินผ่อน'].hasFin) bad('[2] สนใจผ่อนแต่แถบไม่มีขั้นไฟแนนซ์');
    if (!o['ยังไม่ระบุ'].hasFin) bad('[2] ยังไม่ระบุต้องเดินเส้นเต็ม (fail-open) แต่ไม่มีขั้นไฟแนนซ์');
    if (o['เงินสด'].btn.indexOf('เปิดการขาย') < 0) bad('[3] ปุ่มลูกค้าเงินสดคือ "' + o['เงินสด'].btn + '" ควรพูดถึงเปิดการขาย');
    if (o['เงินผ่อน'].btn.indexOf('ยื่นไฟแนนซ์') < 0) bad('[3] ปุ่มลูกค้าผ่อนคือ "' + o['เงินผ่อน'].btn + '" ควรพูดถึงยื่นไฟแนนซ์');
  }

  /* ---------- [4] บั๊กข้อ 27 — dealSell เงินผ่อนเปิดช่องครบ ---------- */
  const g4 = await p.evaluate(() => {
    const c = CUSTOMERS.find(x => !SALES.some(y => y.custId === x.id && !y.void));
    const keep = c.intent; c.intent = 'เงินผ่อน';
    dealSell(c.id);
    const r = { pay: document.querySelector('#sPay').value,
      finBox: document.querySelector('#sFinBox').style.display,
      finPay: document.querySelector('#sFinPay').style.display,
      cust: document.querySelector('#sCust').value };
    c.intent = keep;
    return r;
  });
  if (g4.pay !== 'finance') bad('[4] dealSell ลูกค้าผ่อนแล้ว #sPay=' + g4.pay);
  if (g4.finBox === 'none') bad('[4] กล่องไฟแนนซ์ #sFinBox ไม่เปิด — บั๊กข้อ 27 ยังอยู่');
  if (g4.finPay === 'none') bad('[4] กล่องยอดผ่อน #sFinPay ไม่เปิด — บั๊กข้อ 27 ยังอยู่ (กล่องที่สอง)');

  /* ---------- [5] setPay จากตารางเทียบค่างวด ---------- */
  const g5 = await p.evaluate(() => {
    go('sell'); setPay('cash');                       /* ตั้งต้นเงินสด กล่องต้องปิด */
    const before = document.querySelector('#sFinPay').style.display;
    document.querySelector('#sellTabs [data-p="p2"]').click();
    document.querySelector('#fNet').value = 60000;
    document.querySelector('#fDown').value = 15000;   /* ดาวน์ 25% — พ้นขั้นต่ำทุกเจ้า ให้มีช่องเลือกจริง */
    document.querySelector('#fNet').dispatchEvent(new Event('input'));
    finCompare();
    const cell = document.querySelector('#finCmp [data-pick]');
    if (!cell) return { noCell: true, before };
    cell.click();
    return { before, pay: document.querySelector('#sPay').value,
      finBox: document.querySelector('#sFinBox').style.display,
      finPay: document.querySelector('#sFinPay').style.display };
  });
  if (g5.noCell) bad('[5] ตารางเทียบค่างวดไม่มีช่องให้เลือก');
  else {
    if (g5.before !== 'none') bad('[5] ตั้งต้นเงินสดแล้วกล่องผ่อนยังเปิด — setPay(cash) ไม่ปิดกล่อง');
    if (g5.pay !== 'finance' || g5.finBox === 'none' || g5.finPay === 'none')
      bad('[5] เลือกค่างวดแล้วกล่องไม่เปิดครบ (pay=' + g5.pay + ' box=' + g5.finBox + ' pay2=' + g5.finPay + ')');
  }

  /* ---------- [6] pill + ตัวกรองในตารางรวม ---------- */
  const g6 = await p.evaluate(() => {
    go('deal'); DEAL_SEL = ''; rDeal();
    const pills = [...document.querySelectorAll('#dlTable tbody tr .pill')]
      .map(x => x.textContent.trim()).filter(t => ['เงินสด', 'เงินผ่อน', 'ยังไม่ระบุ'].indexOf(t) >= 0);
    const el = document.querySelector('#dlPay');
    if (!el) return { noSel: true };
    el.value = 'เงินสด'; el.onchange();
    /* v1.47: ตารางถูกตัดที่การวาด — กางก่อนนับ ไม่งั้นข้อนี้เขียวเพราะบังเอิญเงินสดน้อยกว่า cap
       แล้ววันที่ลูกค้าเงินสดเกิน cap ตัวกรองจะพังโดยไม่มีใครรู้ */
    CAP_OPEN['dlTable'] = true; refreshAll();
    const rows = [...document.querySelectorAll('#dlTable tbody tr')].filter(tr => !tr.querySelector('.empty')).length;
    const want = dealAll().filter(d => dealPay(d) === 'เงินสด').length;
    CAP_OPEN['dlTable'] = false;
    el.value = ''; el.onchange();
    return { noSel: false, pills: pills.length, rows, want };
  });
  if (g6.noSel) bad('[6] ไม่มีตัวกรอง #dlPay');
  else {
    if (g6.pills === 0) bad('[6] ตารางรวมไม่มี pill เงินสด/ผ่อนเลย');
    if (g6.rows !== g6.want) bad('[6] กรองเงินสดได้ ' + g6.rows + ' แถว ควรเป็น ' + g6.want);
  }

  /* ---------- [7] dealProceedSave เขียนจริงแล้วพาไปถูกทาง ---------- */
  const g7 = await p.evaluate(() => {
    const c = CUSTOMERS.find(x => !SALES.some(y => y.custId === x.id && !y.void));
    const keep = { name: c.name, phone: c.phone, addr: c.addr, idNo: c.idNo, intent: c.intent };
    go('deal'); dealProceed(c.id);
    document.querySelector('#dpName').value = 'QA สมบูรณ์';
    document.querySelector('#dpPhone').value = '081-777-7777';
    document.querySelector('#dpAddr').value = '99 หมู่ 9 ต.ทดสอบ';
    const idEl = document.querySelector('#dpIdNo');
    if (!idEl.readOnly) idEl.value = '1234567890129';
    document.querySelector('#dpIntent').value = 'เงินผ่อน';
    const ok = dealProceedSave(c.id);
    const r = { ok, name: c.name, addr: c.addr, intent: c.intent,
      page: CUR, pay: document.querySelector('#sPay').value };
    Object.assign(c, keep);
    return r;
  });
  if (!g7.ok) bad('[7] กรอกครบแล้ว dealProceedSave ยังไม่ผ่าน');
  if (g7.name !== 'QA สมบูรณ์' || g7.addr !== '99 หมู่ 9 ต.ทดสอบ' || g7.intent !== 'เงินผ่อน')
    bad('[7] ข้อมูลไม่ถูกบันทึกลงลูกค้า (name=' + g7.name + ')');
  if (g7.page !== 'sell' || g7.pay !== 'finance') bad('[7] บันทึกแล้วไม่พาไปหน้าขายแบบผ่อน (page=' + g7.page + ' pay=' + g7.pay + ')');

  await b.close();
  if (errors.length) fails.push(...errors);
  if (fails.length) { console.log('FAILS:'); fails.forEach(f => console.log(f)); process.exit(1); }
  console.log('ALL_CHECKS_PASS (intent-r32: 7 ข้อ)');
})().catch(e => { console.error('SUITE_CRASH', e); process.exit(2); });
