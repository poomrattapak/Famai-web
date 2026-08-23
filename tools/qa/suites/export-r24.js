/* ด่าน v1.24 — ปุ่มส่งออกอยู่ในทุกหน้าที่ส่งออกได้
   เจ้าของสั่ง: "ปุ่มกดส่งออก อยากให้อยู่ในแต่ละหน้าที่สามารถส่งออกได้ด้วย
   เพื่อที่จะได้ไม่ต้อง export จากหน้ารายงานอย่างเดียว"
   ตรวจสามชั้น: ปุ่มมีจริงและกดแล้วได้ไฟล์ · ไฟล์ตรงกับที่หน้าจอแสดง · ด่านสิทธิ์อยู่ในฟังก์ชัน ไม่ใช่ที่ปุ่ม */
const { chromium, EXE, BASE } = require('./env');

/* [หน้า, ปุ่ม, แท็บย่อย, จำนวนไฟล์ที่ต้องได้] */
const BTN = [
  ['dash',      '#expSales',  null, 1], ['stock',   '#expStock',  null,  1],
  ['deal',      '#expDeal',   null, 1], ['ar',      '#expAr',     null,  1],
  /* v1.31 (B11): ชุดส่งบัญชีเพิ่มไฟล์ขายส่ง 5 → 6 ไฟล์ ตามคำสั่งเจ้าของรอบ 2 */
  ['expense',   '#expExp',    null, 1], ['expense', '#expBook',   null,  6],
  ['payroll',   '#expPr',     null, 1], ['report',  '#rpCsv',     null,  1],
  ['service',   '#expSv',     'v2', 1], ['service', '#expRemind', 'v3',  1],
  ['parts',     '#expParts',  'pt1',1], ['parts',   '#expMove',   'pt2', 1],
  ['parts',     '#expGift',   'pt3',1], ['sell',    '#expWs',     'p3',  1],
  ['quote',     '#expQuote',  null, 1], ['transfer','#expTr',     null,  1],
  ['aftercare', '#expCare',   null, 1], ['hr',      '#expLeave',  null,  1],
  ['users',     '#expStaff',  null, 1]
];

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errors = [];
  const bad = m => fails.push(m);
  const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  const login = async id => { await p.goto(BASE + '/index.html');
    await p.click('#lgUsers [data-id="' + id + '"]'); await p.click('#lgGo'); await p.waitForTimeout(400);
    await p.evaluate(() => { window.__F = []; csv = (n, h, r) => window.__F.push({ n, h, rows: r, cols: h.length }); }); };
  await login('ST1');                                   /* แอดมิน เห็นทุกหน้า */

  /* 1 · ปุ่มครบทุกหน้า และกดแล้วได้ไฟล์จริงทุกปุ่ม */
  for (const [pg, sel, pane, want] of BTN) {
    const r = await p.evaluate(([pg, sel, pane]) => {
      go(pg);
      if (pane) { const t = document.querySelector('[data-p="' + pane + '"],[data-v="' + pane + '"]'); if (t) t.click(); }
      const el = document.querySelector(sel);
      if (!el) return { miss: true };
      const n0 = window.__F.length; el.click();
      return { made: window.__F.length - n0, name: (window.__F[window.__F.length - 1] || {}).n || '' };
    }, [pg, sel, pane]);
    if (r.miss) { bad('หน้า ' + pg + ': ไม่มีปุ่มส่งออก ' + sel); continue; }
    if (r.made !== want) bad('หน้า ' + pg + ' ' + sel + ': ได้ ' + r.made + ' ไฟล์ ควรเป็น ' + want);
  }

  /* 2 · ไฟล์ต้องเท่ากับที่หน้าจอแสดง (หน้าที่มีแถบช่วงเวลา)
        บีบช่วงให้แคบกว่าข้อมูลทั้งหมดก่อน ไม่งั้น "ส่งออกทุกแถว" กับ "ส่งออกตามช่วง" ได้เลขเท่ากันโดยบังเอิญ */
  const same = await p.evaluate(() => {
    /* ตารางว่างจะวาดแถวข้อความ "ไม่มีข้อมูล" หนึ่งแถว — ต้องไม่นับเป็นข้อมูล */
    const nRow = sel => [...document.querySelectorAll(sel + ' tbody tr')]
      .filter(tr => !tr.querySelector('.empty')).length;
    const out = {};
    go('parts'); document.querySelector('[data-p="pt2"]').click();
    const stM = perSt('move'); stM.from = ''; stM.to = ''; stM.r = 1; rPartSale();
    const n0 = window.__F.length; document.querySelector('#expMove').click();
    out.move = { file: window.__F[n0].rows.length,
      screen: nRow('#msTable'),
      all: PMOVES.filter(m => inScope(m.branch)).length };
    go('transfer');
    const stT = perSt('transfer'); stT.from = ''; stT.to = ''; stT.r = 1; rTransfer();
    const n1 = window.__F.length; document.querySelector('#expTr').click();
    out.tr = { file: window.__F[n1].rows.length,
      screen: nRow('#tList'), all: TRANSFERS.length, few: true };
    return out;
  });
  Object.entries(same).forEach(([k, v]) => {
    if (v.file !== v.screen) bad(k + ': ไฟล์ ' + v.file + ' แถว ≠ บนจอ ' + v.screen + ' แถว');
    if (!v.few && v.all <= v.screen)
      bad(k + ': ช่วง 1 วันได้ทุกแถวพอดี (' + v.screen + '/' + v.all + ') — ข้อนี้ยังไม่ได้ตรวจว่ากรองจริง');
  });

  /* 3 · เปลี่ยนช่วงเวลาแล้วไฟล์ต้องเปลี่ยนตาม (ไม่ใช่ส่งออกทั้งหมดเสมอ) */
  const byRange = await p.evaluate(() => {
    go('expense');
    const st = perSt('expense');
    st.from = ''; st.to = ''; st.r = 1;  rExpense();
    const n0 = window.__F.length; document.querySelector('#expExp').click();
    const day = window.__F[n0];
    st.r = 365; rExpense();
    const n1 = window.__F.length; document.querySelector('#expExp').click();
    const year = window.__F[n1];
    return { day: day.rows.length, year: year.rows.length, name: day.n };
  });
  if (byRange.year <= byRange.day) bad('เปลี่ยนช่วงแล้วไฟล์ไม่เปลี่ยน (1 วัน ' + byRange.day + ' แถว · 1 ปี ' + byRange.year + ' แถว)');
  if (byRange.name.indexOf('_') < 0) bad('ชื่อไฟล์ค่าใช้จ่ายไม่มีช่วงวันที่: ' + byRange.name);

  /* 4 · ด่านสิทธิ์อยู่ในฟังก์ชัน — เรียกตรง ๆ ด้วยบทบาทต้องห้ามต้องไม่มีไฟล์ออก
        (เซลล์: ไม่ใช่ฝ่ายบุคคล จึงส่งออกรายชื่อพนักงานไม่ได้ · ใบลาได้เฉพาะของตัวเอง) */
  await login('ST3');                                   /* เซลล์ */
  const denied = await p.evaluate(() => {
    const n0 = window.__F.length;
    expStaffList();
    const staffMade = window.__F.length - n0;
    const n1 = window.__F.length;
    expLeaves();
    const lv = window.__F[n1] || null;
    return { staffMade, boss: canFixAtt(),
      lvRows: lv ? lv.rows.length : 0,
      lvOther: lv ? lv.rows.filter(r => r[2] !== ME.name).length : 0,
      lvAll: LEAVES.length };
  });
  if (denied.boss)         bad('เซลล์ไม่ควรมีสิทธิ์ตรวจการลงเวลา — seed สิทธิ์เปลี่ยนไป ด่านนี้ไม่ได้ตรวจจริง');
  if (denied.staffMade)    bad('เซลล์เรียก expStaffList() ตรง ๆ แล้วยังได้ไฟล์ (ด่านอยู่ที่ปุ่ม ไม่ได้อยู่ในฟังก์ชัน)');
  if (denied.lvOther)      bad('เซลล์ส่งออกใบลาแล้วเห็นใบของคนอื่น ' + denied.lvOther + ' ใบ (ประเภทการลาเป็นข้อมูลสุขภาพ)');

  /* 5 · บทบาทที่ไม่มีสิทธิ์เห็นเงิน — คอลัมน์เงินต้องหายจากไฟล์ */
  const nom = await p.evaluate(() => {
    const n0 = window.__F.length;
    expGifts();
    const f = window.__F[n0];
    return { money: !noMoney(), head: f.h };
  });
  if (nom.money) bad('เซลล์เห็นตัวเลขเงินอยู่ — seed สิทธิ์เปลี่ยนไป ด่านข้อ 5 ไม่ได้ตรวจจริง');
  else if (nom.head.some(h => /ทุน|ราคาขาย/.test(h)))
    bad('ไฟล์ของแถมยังมีคอลัมน์เงินทั้งที่ไม่มีสิทธิ์: ' + nom.head.join(','));

  /* 6 · เลขบัญชี/ประกันสังคมของพนักงาน ปิดกลางเว้นบทบาทที่ได้สิทธิ์ (กฎข้อ 13) */
  await login('ST8');                                   /* ฝ่ายบุคคล — ส่งออกได้ แต่ไม่มีสิทธิ์เห็นเลขเต็ม */
  const hr = await p.evaluate(() => {
    const n0 = window.__F.length; expStaffList();
    const f = window.__F[n0];
    if (!f) return { none: true };
    const bank = f.h.indexOf('เลขบัญชี'), ssn = f.h.indexOf('เลขประกันสังคม');
    return { rows: f.rows.length, full: canSeeId(),
      masked: f.rows.every(r => String(r[bank]).indexOf('···') === 0 && String(r[ssn]).indexOf('···') === 0) };
  });
  if (hr.none)                  bad('ฝ่ายบุคคลส่งออกรายชื่อพนักงานไม่ได้ (ควรได้)');
  else if (!hr.full && !hr.masked) bad('เลขบัญชี/ปกส. ไม่ถูกปิดกลางทั้งที่ไม่มีสิทธิ์ data:idNo');

  console.log(fails.length ? 'FAILS:\n' + [...new Set(fails)].join('\n') : 'ALL_CHECKS_PASS');
  console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})();
