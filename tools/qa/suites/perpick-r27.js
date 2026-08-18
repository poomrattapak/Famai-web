/* ด่านของตัวเลือกช่วงเวลา v1.27 — คำสั่งเจ้าของ: "มีให้กดยืนยันด้วยตอนเลือกเวลาเสร็จแล้ว"
   และ "เลือกช่วงในปฏิทินอันเดียว กดครั้งแรก=วันเริ่ม กดครั้งที่สอง=วันจบ"

   กติกาที่ด่านนี้ล็อกไว้:
   1 เลือกแล้วจอยังไม่วาดใหม่ จนกว่าจะกดยืนยัน   4 กดย้อน (จบก่อนเริ่ม) ต้องสลับให้
   2 กดยืนยันแล้ววาดใหม่จริง + แผ่นมือถือปิด      5 บรรทัดสรุปเป็น พ.ศ. และบอกสถานะด้วยข้อความ
   3 ปฏิทินเขียนค่าลงช่องวันที่จริง               6 390px ไม่ล้นจอ · 7 ปิดโดยไม่ยืนยัน = คืนค่าเดิม */
const { chromium, EXE, BASE } = require('./env');

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errs = [];
  const login = async (pg) => { await pg.goto(BASE + '/index.html');
    await pg.click('#lgUsers [data-id="ST2"]'); await pg.click('#lgGo'); await pg.waitForTimeout(500); };

  const p = await (await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } })).newPage();
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await login(p);

  /* 1 · กดชิปแล้วสถานะต้องเปลี่ยนทันที (ทั้งแอปอ่านจาก perOf) แต่ "จอ" ต้องยังไม่วาดใหม่ */
  const t1 = await p.evaluate(() => {
    perSt('dash').r = 30; perSt('dash').from = ''; perSt('dash').to = ''; rDash();
    const kpi0 = $('#dKpis').textContent, from0 = dPeriod().from;
    const chip = document.querySelector('#navPerBox [data-pr="1"]');
    if (!chip) return null;
    chip.click();
    return { stateMoved: dPeriod().from !== from0, screenSame: $('#dKpis').textContent === kpi0,
      dirty: !!$('#navPerBox').dataset.dirty, okOn: !document.querySelector('#navPerBox [data-pok]').disabled,
      chipOn: chip.classList.contains('on') };
  });
  if (!t1) fails.push('[1] ไม่มีชิปช่วงเวลาบนแถบบน');
  else {
    if (!t1.stateMoved) fails.push('[1] กดชิปแล้วช่วงเวลาไม่เปลี่ยน (ทั้งแอปอ่านจาก perOf ต้องเปลี่ยนทันที)');
    if (!t1.screenSame) fails.push('[1] กดชิปแล้วจอวาดใหม่ทันที — ต้องรอกดยืนยันก่อน');
    if (!t1.dirty)      fails.push('[1] เลือกแล้วไม่ได้ตั้งธงรอยืนยัน');
    if (!t1.okOn)       fails.push('[1] เลือกแล้วปุ่มยืนยันยังกดไม่ได้');
    if (!t1.chipOn)     fails.push('[1] ชิปที่กดไม่ไฮไลต์');
  }

  /* 5 · บรรทัดสรุปต้องเป็นข้อความ ไม่ใช่แค่สี — และวันที่ต้องเป็น พ.ศ. */
  const t5 = await p.evaluate(() => ({ txt: $('#navPerBox [data-psum]').textContent,
    dot: !!$('#navPerBox [data-psum] i') }));
  if (!/ยังไม่ได้ใช้/.test(t5.txt)) fails.push('[5] ยังไม่ยืนยันแต่ไม่มีข้อความบอก: "' + t5.txt + '"');
  if (!/25\d\d/.test(t5.txt))       fails.push('[5] บรรทัดสรุปไม่ได้เป็นปี พ.ศ.: "' + t5.txt + '"');
  if (!t5.dot)                      fails.push('[5] ไม่มีจุดสีคู่กับข้อความ');

  /* 2 · กดยืนยันแล้วจอต้องวาดใหม่ตรงกับข้อมูลจริง และธงต้องหมด */
  const t2 = await p.evaluate(() => {
    const kpi0 = $('#dKpis').textContent;
    document.querySelector('#navPerBox [data-pok]').click();
    const n = dSales().length;
    return { drew: $('#dKpis').textContent !== kpi0, dirty: !!$('#navPerBox').dataset.dirty,
      okOff: document.querySelector('#navPerBox [data-pok]').disabled,
      match: ($('#dKpis').textContent.replace(/\s/g, '')).indexOf(n + 'คัน') >= 0 };
  });
  if (!t2.drew)   fails.push('[2] กดยืนยันแล้วจอไม่วาดใหม่');
  if (t2.dirty)   fails.push('[2] ยืนยันแล้วธงรอยืนยันยังค้าง');
  if (!t2.okOff)  fails.push('[2] ยืนยันแล้วปุ่มยังกดได้ทั้งที่ไม่มีอะไรให้ใช้');
  if (!t2.match)  fails.push('[2] ตัวเลขบนจอไม่ตรงกับ dSales() หลังยืนยัน');

  /* 3 · ปฏิทินเขียนค่าลงช่องวันที่จริง (ช่องคือสัญญาที่ทั้งแอปและด่านเดิมใช้) */
  const t3 = await p.evaluate(() => {
    document.querySelector('#navPerBox [data-pcus]').click();
    const cal = document.getElementById('perCal');
    if (!cal || getComputedStyle(cal).display === 'none') return { noCal: true };
    const days = [...cal.querySelectorAll('[data-prd]')].map(d => d.dataset.prd);
    if (days.length < 10) return { few: days.length };
    const hit = ds => cal.querySelector('[data-prd="' + ds + '"]').click();   /* ปฏิทินวาดใหม่ทุกครั้ง ต้องค้นสด */
    const a = days[3], z = days[8];
    hit(a); const midFrom = document.querySelector('#navPerBox [data-pf]').value;
    hit(z);
    return { want: [a, z], midFrom,
      pf: document.querySelector('#navPerBox [data-pf]').value,
      pt: document.querySelector('#navPerBox [data-pt]').value,
      per: dPeriod(), open: getComputedStyle(cal).display !== 'none' };
  });
  if (t3.noCal)      fails.push('[3] กด "กำหนดเอง" แล้วไม่มีปฏิทิน (#perCal)');
  else if (t3.few)   fails.push('[3] ปฏิทินมีวันให้กดแค่ ' + t3.few + ' วัน');
  else {
    if (t3.midFrom !== t3.want[0]) fails.push('[3] กดครั้งแรกไม่ได้ตั้งวันเริ่ม (' + t3.midFrom + ' ≠ ' + t3.want[0] + ')');
    if (t3.pf !== t3.want[0] || t3.pt !== t3.want[1])
      fails.push('[3] กดสองครั้งแล้วช่องวันที่ไม่ตรง: ' + t3.pf + '–' + t3.pt + ' ควรเป็น ' + t3.want.join('–'));
    if (t3.per.from !== t3.want[0] || t3.per.to !== t3.want[1])
      fails.push('[3] ช่วงที่ได้ไม่ตรงกับวันที่กด: ' + JSON.stringify(t3.per));
  }

  /* 4 · กดย้อน (เลือกวันจบก่อนวันเริ่ม) ต้องสลับให้ ไม่ใช่ได้ช่วงว่าง */
  const t4 = await p.evaluate(() => {
    const cal = document.getElementById('perCal');
    if (!cal) return null;
    if (getComputedStyle(cal).display === 'none') document.querySelector('#navPerBox [data-pcus]').click();
    const days = [...cal.querySelectorAll('[data-prd]')].map(d => d.dataset.prd);
    const hit = ds => cal.querySelector('[data-prd="' + ds + '"]').click();
    const late = days[9], early = days[2];
    hit(late); hit(early);
    /* เช็คที่ "ช่องวันที่" กับ "วันที่ถูกไฮไลต์เป็นช่วง" — ไม่เช็คที่ dPeriod()
       เพราะ perOf() สลับให้ตอนอ่านอยู่แล้ว จะมองไม่เห็นว่าปฏิทินสลับหรือไม่ */
    return { per: dPeriod(), want: [early, late],
      pf: document.querySelector('#navPerBox [data-pf]').value,
      pt: document.querySelector('#navPerBox [data-pt]').value,
      inCells: cal.querySelectorAll('.cday.in').length };
  });
  if (!t4) fails.push('[4] ไม่มีปฏิทินให้ทดสอบการสลับวัน');
  else {
    if (t4.pf !== t4.want[0] || t4.pt !== t4.want[1])
      fails.push('[4] กดวันจบก่อนวันเริ่มแล้วช่องวันที่ไม่สลับให้: ' + t4.pf + '–' + t4.pt);
    if (!t4.inCells)
      fails.push('[4] กดย้อนแล้วไม่มีวันไหนถูกไฮไลต์เป็นช่วงกลาง — ปฏิทินไม่รู้ว่าหัวท้ายสลับกัน');
    if (t4.per.from !== t4.want[0] || t4.per.to !== t4.want[1])
      fails.push('[4] ช่วงที่ได้ไม่ตรง: ' + JSON.stringify(t4.per));
  }

  /* ช่องวันที่ต้องยังอยู่ในโครง — ด่านเดิม (brief-r11) ยิง .value + .onchange() ตรงเข้าไป */
  const keep = await p.evaluate(() => {
    const pf = document.querySelector('#navPerBox [data-pf]');
    if (!pf) return { gone: true };
    pf.value = addDays(curDate(), -12); pf.onchange();
    return { ok: dPeriod().from === addDays(curDate(), -12) };
  });
  if (keep.gone) fails.push('[3] ช่อง [data-pf] หายจากโครง — ด่านเดิมยิง .onchange() ตรงเข้าไป');
  else if (!keep.ok) fails.push('[3] ตั้งค่า [data-pf] แล้วเรียก .onchange() แล้วช่วงไม่เปลี่ยน');
  await p.context().close();

  /* 6 + 7 · มือถือ: ปฏิทินไม่ล้นจอ · ปิดแผ่นโดยไม่ยืนยันต้องคืนค่าเดิม */
  const m = await (await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 390, height: 844 } })).newPage();
  m.on('pageerror', e => errs.push('PAGEERROR(390) ' + e.message));
  await login(m);
  const before = await m.evaluate(() => dPeriod().from);
  await m.click('#npBtn'); await m.waitForTimeout(250);
  await m.evaluate(() => document.querySelector('#navPerBox [data-pr="1"]').click());
  const staged = await m.evaluate(() => dPeriod().from);
  await m.mouse.click(10, 830); await m.waitForTimeout(250);
  const rev = await m.evaluate(() => ({ from: dPeriod().from, open: $('#navCtl').classList.contains('on') }));
  if (staged === before) fails.push('[7] กดชิปในแผ่นแล้วช่วงไม่เปลี่ยน — ทดสอบการคืนค่าไม่ได้');
  if (rev.open)          fails.push('[7] กดนอกแผ่นแล้วแผ่นไม่ปิด');
  if (rev.from !== before) fails.push('[7] ปิดแผ่นโดยไม่ยืนยันแล้วไม่คืนค่าเดิม (' + before + ' → ' + rev.from + ')');

  await m.click('#npBtn'); await m.waitForTimeout(250);
  const t6 = await m.evaluate(() => {
    document.querySelector('#navPerBox [data-pcus]').click();
    const cal = document.getElementById('perCal');
    const months = cal ? cal.querySelectorAll('.calm').length : 0;
    return { months, w: cal ? cal.getBoundingClientRect().width : 0,
      sw: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) };
  });
  if (t6.months !== 1) fails.push('[6] 390: ปฏิทินโชว์ ' + t6.months + ' เดือน ควรเหลือเดือนเดียว');
  if (t6.w > 390)      fails.push('[6] 390: ปฏิทินกว้าง ' + t6.w.toFixed(0) + 'px เกินจอ');
  if (t6.sw > 390)     fails.push('[6] 390: เปิดปฏิทินแล้วจอเลื่อนซ้าย-ขวาได้ (' + t6.sw + 'px)');
  await m.context().close();

  console.log(fails.length ? 'FAILS:\n' + fails.join('\n') : 'ALL_CHECKS_PASS');
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})();
