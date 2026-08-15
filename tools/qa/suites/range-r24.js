/* ด่าน v1.24 — ช่วงเวลาแบบเลือกเอง (1 วัน/7/15/1 เดือน/3/6/1 ปี + กำหนดเอง)
   เจ้าของสั่ง: "รายงานจะคัดเฉพาะช่วงเวลาที่เลือกมาให้ ตรวจสอบด้วยว่าข้อมูลไม่ตกหล่น"
   ข้อ 1 คือหัวใจ: ตัดเวลาเป็นช่วงย่อยไม่ทับกัน ผลรวมต้องเท่ากับช่วงใหญ่เป๊ะ
   ถ้ามีระเบียนหลุดหายหรือถูกนับซ้ำที่รอยต่อ ตัวเลขจะไม่ลงตัวทันที */
const { chromium, EXE, BASE } = require('./env');

/* แท็บที่กรองตามวัน + วิธีตรวจของแต่ละตัว
   add = จำนวนแถวบวกกันได้ (แถวละระเบียน) · ตัวที่จัดกลุ่ม (monthly/finsum) แถวซ้ำข้ามช่วง ต้องดูผลรวมคอลัมน์แทน */
const TABS = [
  { k:'sales',   add:true,  cols:[8,10] },
  { k:'tax',     add:true,  cols:[4,5,6] },
  { k:'money',   add:true,  cols:[5] },
  { k:'daily',   add:true,  cols:[5] },
  { k:'monthly', add:false, cols:[1,2,4,5] },
  { k:'finsum',  add:false, cols:[1,2,3,4,7] }
];

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errors = [];
  const bad = m => fails.push(m);
  const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await p.goto(BASE + '/index.html');
  await p.click('#lgUsers [data-id="ST1"]'); await p.click('#lgGo'); await p.waitForTimeout(400);
  await p.evaluate(() => go('report'));

  /* ตัวช่วยในหน้า: ตั้งช่วงเองแล้วอ่านผลของแท็บที่ขอ */
  const build = (from, to, tabs) => p.evaluate(([f, t, ts]) => {
    const st = perSt('report'); st.from = f; st.to = t;
    const out = {};
    ts.forEach(x => { const d = rpBuild(x.k);
      out[x.k] = { n: d.rows.length,
        sum: x.cols.map(i => d.rows.reduce((s, r) => s + (typeof r[i] === 'number' ? r[i] : 0), 0)) }; });
    return out;
  }, [from, to, tabs]);

  /* ขอบเขตของข้อมูลทั้งหมดในระบบ — ใช้เป็นช่วงใหญ่ที่ต้องครอบทุกอย่าง */
  const span = await p.evaluate(() => {
    const ds = [];
    SALES.forEach(s => ds.push(s.soldAt));
    EXPENSES.forEach(e => ds.push(String(e.at).slice(0, 10)));
    SERVICE.forEach(v => ds.push(String(v.at).slice(0, 10)));
    PMOVES.forEach(x => ds.push(String(x.at).slice(0, 10)));
    FINCASES.forEach(c => ds.push(String(c.at).slice(0, 10)));
    AR.forEach(a => (a.pays || []).forEach(x => ds.push(String(x.at).slice(0, 10))));
    ds.sort();
    return { min: ds[0], max: ds[ds.length - 1], n: ds.length, today: TODAY };
  });
  if (!span.min) bad('ไม่มีข้อมูลให้ตรวจเลย — seed เปลี่ยนไปจากที่ด่านนี้รู้จัก');

  /* 1 · ผลรวมของช่วงย่อยที่ไม่ทับกัน = ช่วงใหญ่ (หัวใจของข้อ "ข้อมูลไม่ตกหล่น") */
  const A = span.min, Z = span.max;
  const cut = await p.evaluate(([a, z]) => {
    const d = days(a, z);                      /* แบ่งสามท่อน จุดตัดคำนวณในหน้าเว็บ (โซนเวลาเดียวกับแอป) */
    return [addDays(a, Math.floor(d / 3)), addDays(a, Math.floor(d * 2 / 3))];
  }, [A, Z]);
  const whole = await build(A, Z, TABS);
  const parts = [ await build(A, cut[0], TABS),
                  await build(await p.evaluate(c => addDays(c, 1), cut[0]), cut[1], TABS),
                  await build(await p.evaluate(c => addDays(c, 1), cut[1]), Z, TABS) ];
  for (const t of TABS) {
    if (t.add) {
      const sum = parts.reduce((s, x) => s + x[t.k].n, 0);
      if (sum !== whole[t.k].n)
        bad('แท็บ ' + t.k + ': ผลรวมแถวช่วงย่อย ' + sum + ' ≠ ช่วงใหญ่ ' + whole[t.k].n + ' (มีของหายหรือนับซ้ำที่รอยต่อ)');
    }
    t.cols.forEach((c, i) => {
      const sum = parts.reduce((s, x) => s + x[t.k].sum[i], 0);
      if (Math.abs(sum - whole[t.k].sum[i]) > 1)      /* คลาด 1 บาทได้จากการปัดเศษต่อแถว */
        bad('แท็บ ' + t.k + ' คอลัมน์ ' + c + ': ผลรวมช่วงย่อย ' + sum + ' ≠ ช่วงใหญ่ ' + whole[t.k].sum[i]);
    });
  }
  if (whole.sales.n === 0) bad('ช่วงใหญ่ไม่มีรายการขายเลย — ด่านนี้ไม่ได้ตรวจอะไรจริง');

  /* 2 · ขอบช่วงต้องนับด้วย — วันแรกและวันสุดท้ายพอดี ต้องไม่หลุด */
  const edge = await p.evaluate(() => {
    const ds = [...new Set(SALES.filter(s => !s.void).map(s => s.soldAt))].sort();
    const first = ds[0], last = ds[ds.length - 1];
    const nOf = d => SALES.filter(s => !s.void && s.soldAt === d && inScope(s.branch)).length;
    const st = perSt('report');
    st.from = first; st.to = first; const a = rpBuild('sales').rows.length;
    st.from = last;  st.to = last;  const z = rpBuild('sales').rows.length;
    return { first, last, a, z, wantA: nOf(first), wantZ: nOf(last) };
  });
  if (edge.a !== edge.wantA) bad('ขอบต้นช่วง ' + edge.first + ': ได้ ' + edge.a + ' แถว ควรเป็น ' + edge.wantA);
  if (edge.z !== edge.wantZ) bad('ขอบท้ายช่วง ' + edge.last + ': ได้ ' + edge.z + ' แถว ควรเป็น ' + edge.wantZ);

  /* 3 · ไม่มีของนอกช่วงหลุดเข้ามา — เทียบกับการนับตรงจากข้อมูลดิบทีละช่วง */
  const strict = await p.evaluate(([a, z, c]) => {
    const st = perSt('report'), out = [];
    [[a, c[0]], [c[0], c[1]], [c[1], z], [z, z]].forEach(([f, t]) => {
      st.from = f; st.to = t;
      const want = SALES.filter(s => !s.void && inScope(s.branch) && s.soldAt >= f && s.soldAt <= t).length;
      out.push({ f, t, got: rpBuild('sales').rows.length, want });
    });
    return out;
  }, [A, Z, cut]);
  strict.forEach(r => { if (r.got !== r.want)
    bad('ช่วง ' + r.f + '→' + r.t + ': รายงานได้ ' + r.got + ' แถว ข้อมูลดิบมี ' + r.want); });

  /* 4 · ปุ่มลัดทั้ง 7 คำนวณวันถูก · กรอกวันกลับด้านต้องสลับให้ · ล้างแล้วกลับไปใช้ปุ่มลัด */
  const pre = await p.evaluate(() => {
    const st = perSt('report'), out = {};
    PER_PRESETS.forEach(([r]) => { st.from = ''; st.to = ''; st.r = r;
      const p = perOf('report');
      out[r] = (p.from === addDays(TODAY, -(r - 1)) && p.to === TODAY && !p.custom); });
    st.from = TODAY; st.to = addDays(TODAY, -5);            /* กรอกกลับด้าน */
    const sw = perOf('report');
    st.from = ''; st.to = ''; st.r = 7;
    const clr = perOf('report');
    return { out, sw: sw.from === addDays(TODAY, -5) && sw.to === TODAY && sw.custom,
      clr: clr.from === addDays(TODAY, -6) && !clr.custom, n: PER_PRESETS.length };
  });
  if (pre.n !== 7) bad('ปุ่มลัดมี ' + pre.n + ' ตัว ควรเป็น 7 (1/7/15/30/90/180/365)');
  Object.entries(pre.out).forEach(([r, ok]) => { if (!ok) bad('ปุ่มลัด ' + r + ' วัน คำนวณช่วงผิด'); });
  if (!pre.sw)  bad('กรอกวันกลับด้านแล้วไม่สลับให้');
  if (!pre.clr) bad('ล้างช่วงที่เลือกเองแล้วไม่กลับไปใช้ปุ่มลัด');

  /* 5 · ไฟล์ที่ส่งออกต้องเท่ากับที่เห็นบนจอ และชื่อไฟล์บอกช่วงจริง */
  const out5 = await p.evaluate(() => {
    const st = perSt('report'); st.from = ''; st.to = ''; st.r = 365;
    RP_SEL = 'sales'; rReport();
    const real = csv; let got = null;
    csv = (name, head, rows) => { got = { name, n: rows.length, cols: head.length }; };
    document.querySelector('#rpCsv').click();
    csv = real;
    return { got, screen: rpBuild('sales').rows.length, file: perFile('report') };
  });
  if (!out5.got) bad('กดส่งออกแล้วไม่มีไฟล์ออก');
  else {
    if (out5.got.n !== out5.screen) bad('CSV ' + out5.got.n + ' แถว ≠ บนจอ ' + out5.screen + ' แถว');
    if (out5.got.name.indexOf(out5.file) < 0) bad('ชื่อไฟล์ไม่มีช่วงวันที่: ' + out5.got.name);
  }

  /* 6 · ช่วงของแต่ละหน้าแยกกัน — เปลี่ยนที่หน้าแรกต้องไม่ลากหน้ารายงานไปด้วย */
  const iso = await p.evaluate(() => {
    const rp = perSt('report'); rp.from = ''; rp.to = ''; rp.r = 7;
    const before = perOf('report').from;
    const ds = perSt('dash'); ds.from = ''; ds.to = ''; ds.r = 365;
    return { same: perOf('report').from === before, dash: perOf('dash').from, rep: perOf('report').from };
  });
  if (!iso.same || iso.dash === iso.rep) bad('ช่วงเวลาของหน้าแรกกับหน้ารายงานปนกัน (' + iso.dash + ' / ' + iso.rep + ')');

  /* 7 · เงินเดือน: ช่วงคร่อมสองเดือน = ผลรวมของสองงวด (ไม่ใช่งวดเดียว) */
  const pay = await p.evaluate(() => {
    const st = perSt('report');
    const ym = TODAY.slice(0, 7), prevM = (() => { const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
      return m === 1 ? (y - 1) + '-12' : y + '-' + String(m - 1).padStart(2, '0'); })();
    st.from = prevM + '-05'; st.to = ym + '-05';                       /* คร่อมสองเดือน */
    const two = rpBuild('payroll'), months = perMonths('report');
    st.from = ym + '-02'; st.to = ym + '-05';                          /* เดือนเดียว */
    const one = rpBuild('payroll');
    const netOf = d => d.rows.reduce((s, r) => s + r[12], 0);
    return { months: months.length, two: netOf(two), one: netOf(one),
      want: prCalc(prevM).filter(r => inScope(r.s.branch)).reduce((s, r) => s + r.net, 0)
          + prCalc(ym).filter(r => inScope(r.s.branch)).reduce((s, r) => s + r.net, 0) };
  });
  if (pay.months !== 2)   bad('ช่วงคร่อมสองเดือน แต่ perMonths ได้ ' + pay.months + ' งวด');
  if (pay.two !== pay.want) bad('เงินเดือนช่วงสองงวด ' + pay.two + ' ≠ ผลรวมสองงวดจริง ' + pay.want);
  if (pay.two <= pay.one)   bad('ช่วงสองงวดได้ยอดไม่มากกว่างวดเดียว (' + pay.two + ' vs ' + pay.one + ')');

  /* 8 · 390px — แถบช่วงเวลาต้องไม่ทำให้หน้าเลื่อนซ้าย-ขวา */
  const m = await ctx.newPage();
  m.on('pageerror', e => errors.push('M PAGEERROR ' + e.message));
  await m.setViewportSize({ width: 390, height: 844 });
  await m.goto(BASE + '/index.html');
  await m.click('#lgUsers [data-id="ST1"]'); await m.click('#lgGo'); await m.waitForTimeout(400);
  for (const scr of ['report', 'dash']) {
    const w = await m.evaluate(k => { go(k);
      if (k === 'report') document.querySelector('#rpPer [data-pcus]').click();   /* เปิดช่องเลือกวันเองด้วย */
      return Math.max(document.body.scrollWidth, document.documentElement.scrollWidth); }, scr);
    if (w > 390) bad('390px หน้า ' + scr + ': กว้าง ' + w + ' > 390 (แถบช่วงเวลาดันหน้า)');
  }
  await m.close();

  console.log(fails.length ? 'FAILS:\n' + [...new Set(fails)].join('\n') : 'ALL_CHECKS_PASS');
  console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})();
