/* ด่านของช่วงเวลา+สาขาบน navbar v1.26 ข้อ 3 — "ไม่ต้องเลื่อนขึ้นสุดเพื่อเปลี่ยนช่วง"
   กติกา: โชว์เฉพาะหน้าที่มีตัวกรอง · ชิปบนแถบเปลี่ยน state ตัวเดียวกับแถบในหน้า ·
   สาขาเป็น proxy ของ select จริงในหน้า (ไม่มี state กลางใหม่) · เปลี่ยนจากทางอื่นแล้วป้ายต้องตาม ·
   ที่ 390 เป็นแผ่นล่างเปิดจาก #npBtn และไม่ทำจอล้น — ทุกข้อพิสูจน์ mutation แล้ว */
const { chromium, EXE, BASE } = require('./env');

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errs = [];
  const login = async (pg) => { await pg.goto(BASE + '/index.html');
    await pg.click('#lgUsers [data-id="ST2"]'); await pg.click('#lgGo'); await pg.waitForTimeout(500); };

  const p = await (await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } })).newPage();
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await login(p);

  /* 1 · โชว์เฉพาะหน้าที่มีตัวกรอง — dash มี · hr ไม่มี */
  const t1 = await p.evaluate(() => {
    const vis = () => getComputedStyle($('#navCtl')).display !== 'none';
    const dash = vis() && $('#navCtl').classList.contains('has');
    const chips = document.querySelectorAll('#navPerBox [data-pr]').length;
    go('hr'); const hr = vis();
    go('dash');
    return { dash, chips, hr };
  });
  if (!t1.dash)  fails.push('[1] หน้าแรกไม่มีแถวช่วงเวลา+สาขาบน navbar');
  if (!t1.chips) fails.push('[1] #navPerBox ไม่มีชิปช่วงเวลาเลย');
  if (t1.hr)     fails.push('[1] หน้า hr (ไม่มีตัวกรอง) แต่แถวบน navbar ยังโชว์');

  /* 2 · กดชิปบนแถบบน → ช่วงของหน้าเปลี่ยน + KPI เปลี่ยน + ป้ายปุ่มย่อเปลี่ยน */
  const t2 = await p.evaluate(() => {
    perSt('dash').r = 30; perSt('dash').from = ''; perSt('dash').to = ''; rDash();
    const before = { from: dPeriod().from, sold: dSales().length };
    const chip = document.querySelector('#navPerBox [data-pr="1"]');
    if (!chip) return null;                 /* ชิปหาย = ด่านต้องแดงสะอาด ไม่ใช่ crash */
    chip.click();
    return { before, from: dPeriod().from, sold: dSales().length,
      chipOn: chip.classList.contains('on'),
      lbl: $('#npLbl').textContent };
  });
  if (!t2) { fails.push('[2] ไม่มีชิปช่วงเวลาบน navbar ให้กดเลย'); }
  else {
  if (t2.from === t2.before.from) fails.push('[2] กดชิป "วันนี้" บนแถบบนแล้วช่วงของหน้าไม่เปลี่ยน');
  if (t2.before.sold > 0 && t2.sold >= t2.before.sold) fails.push('[2] บีบช่วงเหลือวันเดียวแล้วยอดขายไม่ลด — การ์ดไม่ได้วาดใหม่');
  if (!t2.chipOn) fails.push('[2] ชิปที่กดไม่ไฮไลต์');
  if (t2.lbl.indexOf('วันนี้') < 0) fails.push('[2] ป้ายปุ่มย่อไม่อัปเดตตามชิป: "' + t2.lbl + '"');
  }

  /* 3 · เปลี่ยนช่วงจากทางอื่น (แบบด่านเดิมยิงผ่าน evaluate) → ป้ายบนแถบต้องตาม */
  const t3 = await p.evaluate(() => {
    perSt('dash').r = 15; perSt('dash').from = ''; perSt('dash').to = ''; rDash();
    const c = document.querySelector('#navPerBox [data-pr="15"]');
    return { lbl: $('#npLbl').textContent, chip15: !!c && c.classList.contains('on') };
  });
  if (t3.lbl.indexOf('15 วัน') < 0) fails.push('[3] แก้ perSt ตรง+rDash แล้วป้ายแถบบนไม่ตาม: "' + t3.lbl + '"');
  if (!t3.chip15) fails.push('[3] แก้ perSt ตรงแล้วชิป 15 วันบนแถบบนไม่ไฮไลต์');

  /* 4 · สาขาเป็น proxy จริง — เปลี่ยนบนแถบแล้ว select ของหน้าเปลี่ยนและข้อมูลกรองตาม */
  const t4 = await p.evaluate(() => {
    perSt('dash').r = 30; rDash();
    const all = dUnits().length;
    const sel = $('#navBrSel'), opt = [...sel.options].find(o => o.value);
    if (!opt) return null;
    sel.value = opt.value; sel.onchange();
    const r = { all, one: dUnits().length, page: $('#dBranch').value, want: opt.value };
    sel.value = ''; sel.onchange();
    return r;
  });
  if (!t4) fails.push('[4] แถบบนไม่มีตัวเลือกสาขาให้ทดสอบ');
  else {
    if (t4.page !== t4.want) fails.push('[4] เปลี่ยนสาขาบนแถบแล้ว #dBranch ของหน้าไม่เปลี่ยน');
    if (t4.one >= t4.all)    fails.push('[4] เปลี่ยนสาขาแล้วสต๊อกไม่ลด (' + t4.all + ' → ' + t4.one + ') — ไม่ได้กรองจริง');
  }

  /* 5 · สลับหน้าแล้วชิปต้องผูกกับ key ของหน้านั้น ไม่ใช่ค้างของหน้าก่อน */
  const t5 = await p.evaluate(() => {
    go('report'); const rp = $('#navPerBox').dataset.per;
    go('dash');   const dz = $('#navPerBox').dataset.per;
    return { rp, dz };
  });
  if (t5.rp !== 'report') fails.push('[5] ไปหน้ารายงานแล้วชิปยังผูกกับ "' + t5.rp + '" ไม่ใช่ report');
  if (t5.dz !== 'dash')   fails.push('[5] กลับหน้าแรกแล้วชิปผูกกับ "' + t5.dz + '" ไม่ใช่ dash');
  await p.context().close();

  /* 6 · มือถือ 390: ปุ่มย่อ → แผ่นล่าง → กดชิปได้จริง · ทุกหน้าที่มีตัวกรองไม่ล้นจอ */
  const m = await (await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 390, height: 844 } })).newPage();
  m.on('pageerror', e => errs.push('PAGEERROR(390) ' + e.message));
  await login(m);
  if (!await m.isVisible('#npBtn')) fails.push('[6] 390: ไม่เห็นปุ่มย่อช่วงเวลา+สาขา');
  else {
    await m.click('#npBtn'); await m.waitForTimeout(250);
    /* v1.26.1: แผ่นต้องโผล่ด้านบน (ตรงปุ่มที่กด) ไม่ใช่เด้งจากขอบล่างให้สายตากระโดดข้ามจอ */
    const pos = await m.evaluate(() => { const r = $('#navCtl').getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, w: r.width }; });
    if (pos.top > 844 / 2)        fails.push('[6] 390: แผ่นเปิดที่ครึ่งล่างจอ (top=' + pos.top.toFixed(0) + ') — ต้องโผล่ด้านบนตรงปุ่ม');
    if (pos.bottom > 844 - 40)    fails.push('[6] 390: แผ่นแนบขอบล่างจอ (bottom=' + pos.bottom.toFixed(0) + ') — ยังเป็นแผ่นล่างอยู่');
    if (pos.w > 390)              fails.push('[6] 390: แผ่นกว้างเกินจอ (' + pos.w.toFixed(0) + 'px)');
    if (!await m.isVisible('#navPerBox [data-pr="7"]')) fails.push('[6] 390: เปิดแผ่นแล้วไม่เห็นชิปช่วงเวลา');
    else {
      const chg = await m.evaluate(() => { const before = dPeriod().from;
        document.querySelector('#navPerBox [data-pr="7"]').click();
        return dPeriod().from !== before; });
      if (!chg) fails.push('[6] 390: กดชิปในแผ่นแล้วช่วงไม่เปลี่ยน');
    }
    /* กดนอกแผ่นต้องปิด — pointerdown ที่หัวหน้า */
    /* จุด "นอกแผ่น" ต้องอยู่ใต้แผ่น — แผ่นบนคลุมแถบบนแล้ว คลิก #pgT จะโดนแผ่นดักแทน (v1.26.1) */
    await m.mouse.click(10, 830); await m.waitForTimeout(200);
    if (await m.isVisible('#navPerBox [data-pr="7"]')) fails.push('[6] 390: กดนอกแผ่นแล้วแผ่นไม่ปิด');
  }
  /* 7 · เดินครบทุกหน้าที่ navbar คุม — ไม่มี pageerror และไม่ล้นจอ (พิสูจน์ไม่ชน closeFilters) */
  const pages = await m.evaluate(() => Object.keys(NAV_PER).concat(Object.keys(NAV_BR))
    .filter((k, i, a) => a.indexOf(k) === i).filter(k => canSee(k)));
  for (const k of pages) {
    await m.evaluate(kk => go(kk), k); await m.waitForTimeout(250);
    const w = await m.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth));
    if (w > 390) fails.push('[7] 390: หน้า ' + k + ' กว้าง ' + w + 'px — มีของล้น');
  }
  await m.context().close();

  console.log(fails.length ? 'FAILS:\n' + fails.join('\n') : 'ALL_CHECKS_PASS');
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})();
