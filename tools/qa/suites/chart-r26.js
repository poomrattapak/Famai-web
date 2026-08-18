/* ด่านของกราฟละเอียด v1.26 ข้อ 1 — แกน x/y เป็น HTML นอก SVG · กดดูตัวเลขได้ผ่าน #tip
   สเกลแกน y ต้องใช้ top (max≤2 → max+1) ไม่ใช่ max · เงินใน tooltip ต้องเคารพ noMoney()
   ของตกแต่งใหม่ห้ามเป็น <path> ไม่มี C (สัญญา dash-r25 ข้อ 2) — ทุกข้อพิสูจน์ mutation แล้ว */
const { chromium, EXE, BASE } = require('./env');

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errs = [];
  const login = async (pg, id) => { await pg.goto(BASE + '/index.html');
    await pg.click('#lgUsers [data-id="' + id + '"]'); await pg.click('#lgGo'); await pg.waitForTimeout(500); };

  const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await login(p, 'ST2');

  /* 1 · สเกลแกน y — helper ต้องเผื่อขั้นเมื่อ max≤2 และป้ายบนสุดต้องเป็น top ตัวเดียวกัน
     บีบช่วงจนยอดต่อช่วง ≤2 เพื่อให้ top ≠ max แล้วดูว่าป้ายตามตัวไหน */
  const t1 = await p.evaluate(() => {
    const u = curvePath([0, 1, 1, 0], 320, 96, 8);
    let found = null;
    for (const r of [2, 3, 5, 7]) {
      perSt('dash').r = r; perSt('dash').from = ''; perSt('dash').to = ''; rDash();
      const per = dPeriod(), perLen = days(per.from, per.to) + 1;
      const nb = Math.max(1, Math.min(12, perLen)), step = perLen / nb, vals = [];
      for (let i = 0; i < nb; i++) {
        const a = addDays(per.from, Math.floor(i * step));
        const z = addDays(per.from, Math.max(Math.floor(i * step), Math.floor((i + 1) * step) - 1));
        vals.push(dSales().filter(x => x.soldAt >= a && x.soldAt <= z).length);
      }
      const mx = Math.max(1, ...vals);
      if (nb > 1 && mx <= 2) { found = { r, mx, lbl: (document.querySelector('#chTrend .axy span') || {}).textContent }; break; }
    }
    perSt('dash').r = 30; rDash();
    return { utop: u.top, umax: u.max, found };
  });
  if (t1.utop !== 2 || t1.umax !== 1) fails.push('[1] curvePath([0,1,1,0]) ให้ top=' + t1.utop + ' max=' + t1.umax + ' — สเกลเผื่อขั้นหาย');
  if (!t1.found) fails.push('[1] หาช่วงที่ยอดต่อช่วง ≤2 ไม่ได้ในข้อมูลสาธิต — ด่านตรวจสเกลไม่ได้');
  else if (Number(t1.found.lbl) !== t1.found.mx + 1)
    fails.push('[1] ยอดสูงสุด ' + t1.found.mx + ' แต่ป้ายแกน y บนสุดคือ "' + t1.found.lbl + '" (ต้องเป็น top=' + (t1.found.mx + 1) + ' ตามสเกลจริง)');

  /* 2 · ป้ายแกน x ต้องตรง bucket แรก/ท้ายจริง */
  const t2 = await p.evaluate(() => {
    const per = dPeriod(), perLen = days(per.from, per.to) + 1;
    const nb = Math.max(1, Math.min(12, perLen)), step = perLen / nb;
    const first = thShort(per.from), last = thShort(addDays(per.from, Math.floor((nb - 1) * step)));
    const ax = [...document.querySelectorAll('#chTrend .axx span')].map(s => s.textContent.trim());
    return { first, last, ax };
  });
  if (t2.ax.length < 2) fails.push('[2] ไม่มีป้ายแกน x ใต้กราฟเส้น');
  else {
    if (t2.ax[0] !== t2.first) fails.push('[2] ป้ายแกน x ซ้าย "' + t2.ax[0] + '" ≠ ช่วงแรกจริง "' + t2.first + '"');
    if (t2.ax[t2.ax.length - 1] !== t2.last) fails.push('[2] ป้ายแกน x ขวา "' + t2.ax[t2.ax.length - 1] + '" ≠ ช่วงท้ายจริง "' + t2.last + '"');
  }

  /* 3 · กดบนเส้นแล้วตัวเลขใน tooltip ต้องตรงกับ bucket ที่กดจริง
     เลือก bucket ที่ค่าต่างจาก bucket แรก — กันโค้ดชี้ผิดตัวแล้วบังเอิญเลขเท่ากัน */
  const t3 = await p.evaluate(() => {
    const per = dPeriod(), perLen = days(per.from, per.to) + 1;
    const nb = Math.max(1, Math.min(12, perLen)), step = perLen / nb, bs = [];
    for (let i = 0; i < nb; i++) {
      const a = addDays(per.from, Math.floor(i * step));
      const z = addDays(per.from, Math.max(Math.floor(i * step), Math.floor((i + 1) * step) - 1));
      bs.push(dSales().filter(x => x.soldAt >= a && x.soldAt <= z).length);
    }
    const pick = bs.findIndex(v => v !== bs[0]);
    if (pick < 0) return { skip: 'ทุก bucket เท่ากัน' };
    const sp = document.querySelector('#chTrend .spark');
    const r = sp.getBoundingClientRect();
    const gstep = (320 - 16) / (nb - 1);
    const x = r.left + (8 + gstep * pick) / 320 * r.width, y = r.top + r.height / 2;
    sp.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true }));
    const tip = document.getElementById('tip');
    return { want: bs[pick], shown: getComputedStyle(tip).display !== 'none',
      txt: tip.textContent, m: (tip.textContent.match(/(\d+)\s*คัน/) || [])[1] };
  });
  if (t3.skip) fails.push('[3] ' + t3.skip + ' — ข้อมูลสาธิตไม่พอทดสอบ');
  else {
    if (!t3.shown) fails.push('[3] กดบนเส้นแล้ว tooltip ไม่โผล่');
    else if (Number(t3.m) !== t3.want) fails.push('[3] กด bucket ที่มี ' + t3.want + ' คัน แต่ tooltip บอก "' + t3.txt.slice(0, 60) + '"');
  }

  /* 3b · แท่งนอนกับโดนัทก็กดได้ และเลขตรงกับที่พิมพ์ข้างแถว */
  const t3b = await p.evaluate(() => {
    tipHide();
    const bar = document.querySelector('#chBranch .bar[data-hi]');
    if (!bar) return { noBar: true };
    const shownV = bar.querySelector('.bl b').textContent.trim();
    const r = bar.getBoundingClientRect();
    bar.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + 20, clientY: r.top + 5, bubbles: true }));
    const tipBar = document.getElementById('tip').textContent;
    tipHide();
    const seg = document.querySelector('#chModel circle[data-seg]');
    if (!seg) return { noSeg: true };
    seg.dispatchEvent(new PointerEvent('pointerdown', { clientX: 400, clientY: 400, bubbles: true }));
    const tipSeg = document.getElementById('tip').textContent;
    return { shownV, tipBar, tipSeg };
  });
  if (t3b.noBar) fails.push('[3b] แถวแท่งนอนไม่มี data-hi — กดดูตัวเลขไม่ได้');
  else if (t3b.noSeg) fails.push('[3b] โดนัทไม่มี circle[data-seg] — กดดูตัวเลขไม่ได้');
  else {
    if (t3b.tipBar.indexOf(t3b.shownV) < 0) fails.push('[3b] tooltip แท่งนอนไม่มีเลข ' + t3b.shownV + ': "' + t3b.tipBar.slice(0, 60) + '"');
    if (!/คัน/.test(t3b.tipSeg)) fails.push('[3b] tooltip โดนัทไม่บอกจำนวนคัน: "' + t3b.tipSeg.slice(0, 60) + '"');
  }

  /* 6 · ของใหม่ทั้งหมดต้องไม่ละเมิดสัญญา dash-r25 ข้อ 2 — path หลายจุดต้องมี C */
  const t6 = await p.evaluate(() => [...document.querySelectorAll('#s-dash svg path')]
    .map(x => x.getAttribute('d') || '').filter(d => !d.includes('C') && (d.match(/L/g) || []).length > 1).length);
  if (t6) fails.push('[6] มี path เส้นหัก ' + t6 + ' เส้นใน #s-dash — กริด/แกนต้องเป็น <line> หรือ HTML');
  await ctx.close();

  /* 4 · เซลล์ (ไม่มีสิทธิ์เงิน) เปิด tooltip แล้วต้องไม่เห็นตัวเลขเงิน */
  const c3 = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } });
  const p3 = await c3.newPage();
  p3.on('pageerror', e => errs.push('PAGEERROR(ST3) ' + e.message));
  await login(p3, 'ST3');
  const t4 = await p3.evaluate(() => {
    if (!noMoney()) return { skip: 'ST3 มีสิทธิ์เงิน?' };
    const sp = document.querySelector('#chTrend .spark');
    const r = sp.getBoundingClientRect();
    sp.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + r.width - 4, clientY: r.top + 10, bubbles: true }));
    const a = document.getElementById('tip').textContent; tipHide();
    const bar = document.querySelector('#chBranch .bar[data-hi]');
    bar.dispatchEvent(new PointerEvent('pointerdown', { clientX: 300, clientY: 300, bubbles: true }));
    const c = document.getElementById('tip').textContent; tipHide();
    return { a, c };
  });
  if (t4.skip) fails.push('[4] ' + t4.skip);
  else {
    if (/฿/.test(t4.a) || /\d{1,3}(,\d{3})+/.test(t4.a)) fails.push('[4] เซลล์เห็นเงินใน tooltip เส้น: "' + t4.a.slice(0, 60) + '"');
    if (/\d{1,3}(,\d{3})+/.test(t4.c)) fails.push('[4] เซลล์เห็นเงินใน tooltip แท่ง: "' + t4.c.slice(0, 60) + '"');
  }
  await c3.close();

  /* 5 · tooltip ที่ 390 ต้องถูกหนีบไม่ให้ล้นขอบ และไม่ทำจอเลื่อนข้าง */
  const m = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 390, height: 844 } });
  const mp = await m.newPage();
  mp.on('pageerror', e => errs.push('PAGEERROR(390) ' + e.message));
  await login(mp, 'ST2');
  const t5 = await mp.evaluate(() => {
    const sp = document.querySelector('#chTrend .spark');
    sp.scrollIntoView(); const r = sp.getBoundingClientRect();
    sp.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.right - 2, clientY: r.top + 10, bubbles: true }));
    const t = document.getElementById('tip').getBoundingClientRect();
    return { right: t.right, sw: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) };
  });
  if (t5.right > 390) fails.push('[5] tooltip ล้นขอบขวาที่ 390 (right=' + t5.right.toFixed(0) + ')');
  if (t5.sw > 390)    fails.push('[5] เปิด tooltip แล้วจอกว้าง ' + t5.sw + 'px — เลื่อนข้างได้');
  await m.close();

  console.log(fails.length ? 'FAILS:\n' + fails.join('\n') : 'ALL_CHECKS_PASS');
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})();
