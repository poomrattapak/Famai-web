/* ด่าน v1.25 — หน้าแรกเบนโตะ (ผสมแบบ 3 "งานค้าง" กับแบบ 4 "สต๊อก" จาก docs/dash/)
   เจ้าของเลือก: กริดเดียวทั้งหน้า งานค้างนำ · โทนเย็น · การ์ดเดิมต้องอยู่ครบไม่หายไปไหน
   และคำสั่งเดิมที่ยังใช้อยู่: "กราฟทุกกราฟต้องโค้งมน ไม่เอาแบบหยักหรือเหลี่ยม"

   ที่ด่านนี้กัน (แต่ละข้อพิสูจน์แล้วว่าถอดของที่มันคุมออก → แดงจริง):
   1 การ์ดเดิมหายไประหว่างจัดหน้าใหม่   5 คิวงานเรียงผิด / เลยกำหนดสื่อด้วยสีอย่างเดียว
   2 กราฟกลับไปเป็นเส้นหัก/แท่งเหลี่ยม  6 คนไม่มีสิทธิ์เงินเห็นตัวเลขเงิน
   3 เลขบนการ์ดไม่ตรงกับข้อมูลจริง      7 เลื่อนซ้าย-ขวาที่ 390px
   4 ตัวเลขกลางวงแหวนไม่ตรงกับวง        8 สีกราฟอ่านไม่ออกบนพื้นการ์ดบางธีม */
const { chromium, EXE, BASE } = require('./env');

/* การ์ดทุกใบที่ต้องมีบนหน้าแรก — ของเดิม 11 ใบ + คิวงาน (#dQueue) กับเงินค้างรับ (#dAr) ที่แยกออกมาใหม่ */
const CARDS = ['dKpis','dReg','dQueue','todo','dAr','chModel','chBranch','chAge','chTrend',
               'chStaff','dAlert','recentSales'];
const THEMES = ['std','dark','warm','cool'];

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errors = [];
  const bad = m => fails.push(m);
  const login = async (pg, id) => { await pg.goto(BASE + '/index.html');
    await pg.click('#lgUsers [data-id="' + id + '"]'); await pg.click('#lgGo'); await pg.waitForTimeout(500);
    await pg.evaluate(() => go('dash')); await pg.waitForTimeout(300); };

  const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await login(p, 'ST2');                       /* ST2 = ผู้จัดการ เห็นเงินและทุกสาขา */

  /* 1 · การ์ดเดิมอยู่ครบและมีเนื้อหาจริง — div เปล่าไม่นับว่ามี */
  const t1 = await p.evaluate(ids => ids.map(id => {
    const e = document.getElementById(id);
    return { id, has: !!e, txt: e ? e.textContent.replace(/\s+/g, '').length : 0 };
  }), CARDS);
  for (const r of t1) {
    if (!r.has)      bad('[1] ไม่มีการ์ด #' + r.id + ' บนหน้าแรกแล้ว');
    else if (!r.txt) bad('[1] การ์ด #' + r.id + ' ว่างเปล่า');
  }

  /* 2 · กราฟต้องโค้งมนทุกตัว — เส้นต้องมีคำสั่งโค้ง (C) · วงแหวนปลายมน · แท่งเป็นแคปซูล */
  const t2 = await p.evaluate(() => {
    const paths = [...document.querySelectorAll('#s-dash svg path')].map(x => x.getAttribute('d') || '');
    /* เส้นกราฟ = path ที่ลากผ่านหลายจุด · ไม่มี C แต่มี L หลายอัน = ยังเป็นเส้นหัก */
    const lineBad = paths.filter(d => !d.includes('C') && (d.match(/L/g) || []).length > 1);
    const rings = [...document.querySelectorAll('#s-dash circle[stroke-dasharray]')];
    const capBad = rings.filter(c => c.getAttribute('stroke-linecap') !== 'round').length;
    const bars = [...document.querySelectorAll('#s-dash .bf')];
    const barBad = bars.filter(e => {
      const s = getComputedStyle(e);
      return parseFloat(s.borderTopLeftRadius) < parseFloat(s.height) / 2;
    }).length;
    return { nPath: paths.length, lineBad: lineBad.length, nRing: rings.length, capBad, nBar: bars.length, barBad };
  });
  if (!t2.nPath)   bad('[2] ไม่มีเส้นกราฟบนหน้าแรกเลย — กราฟยอดขายหายไป?');
  if (!t2.nRing)   bad('[2] ไม่มีวงแหวนบนหน้าแรกเลย — การ์ดความคืบหน้าหายไป?');
  if (!t2.nBar)    bad('[2] ไม่มีแท่งกราฟบนหน้าแรกเลย');
  if (t2.lineBad)  bad('[2] เส้นกราฟยังหักเป็นเหลี่ยม ' + t2.lineBad + ' เส้น (ต้องมีคำสั่ง C)');
  if (t2.capBad)   bad('[2] วงแหวนปลายไม่มน ' + t2.capBad + ' วง (ต้อง stroke-linecap="round")');
  if (t2.barBad)   bad('[2] แท่งยังไม่เป็นแคปซูล ' + t2.barBad + ' แท่ง (มุมโค้งต้อง ≥ ครึ่งความสูง)');

  /* 3 · เลขบนการ์ดต้องมาจากข้อมูลจริง และต้องขยับตามช่วงเวลาและสาขาที่เลือก
     ถ้าใครไปคิดเลขจาก UNITS/SALES ตรง ๆ แทน dUnits()/dSales() ข้อนี้จะจับได้ */
  const num = s => Number(String(s).replace(/[^\d]/g, '')) || 0;
  const readKpi = () => p.evaluate(() => [...document.querySelectorAll('#dKpis .kpi')]
    .map(k => ({ l: k.querySelector('.l').textContent.trim(), v: k.querySelector('.v').textContent.trim() })));
  const truth = () => p.evaluate(() => ({ stock: dUnits().length, sold: dSales().length,
    rev: dSales().reduce((s, x) => s + x.net, 0) }));

  const chk3 = async tag => {
    const k = await readKpi(), t = await truth();
    const get = n => { const r = k.find(x => x.l.indexOf(n) === 0); return r ? num(r.v) : null; };
    if (get('รถพร้อมขาย') !== t.stock)   bad('[3]' + tag + ' รถพร้อมขาย ' + get('รถพร้อมขาย') + ' ≠ dUnits() ' + t.stock);
    if (get('ขายได้') !== t.sold)         bad('[3]' + tag + ' ขายได้ ' + get('ขายได้') + ' ≠ dSales() ' + t.sold);
    if (get('ยอดขายรวม') !== t.rev)      bad('[3]' + tag + ' ยอดขายรวม ' + get('ยอดขายรวม') + ' ≠ ผลรวมจริง ' + t.rev);
    return t;
  };
  const a = await chk3(' 30 วัน');
  /* บีบเหลือวันเดียว — ยอดขายต้องลดลง ไม่งั้นแปลว่าไม่ได้กรองตามช่วงเลย */
  await p.evaluate(() => { perSt('dash').r = 1; perSt('dash').from = ''; perSt('dash').to = ''; rDash(); });
  await p.waitForTimeout(300);
  const c = await chk3(' 1 วัน');
  if (c.sold >= a.sold && a.sold > 0) bad('[3] เปลี่ยนช่วงเป็น 1 วันแล้วยอดขายไม่ลดลง (' + a.sold + ' → ' + c.sold + ') — การ์ดไม่ได้กรองตามช่วง');
  await p.evaluate(() => { perSt('dash').r = 365; rDash(); }); await p.waitForTimeout(300);

  /* เลือกสาขาเดียว — สต๊อกต้องลดลงจากทุกสาขา */
  const brTest = await p.evaluate(() => {
    const all = dUnits().length;
    const sel = document.getElementById('dBranch');
    const opt = [...sel.options].find(o => o.value);
    if (!opt) return null;
    sel.value = opt.value; sel.onchange();
    return { all, one: dUnits().length, name: opt.textContent };
  });
  await p.waitForTimeout(300);
  if (brTest && brTest.one >= brTest.all) bad('[3] เลือกสาขา "' + brTest.name + '" แล้วสต๊อกไม่ลด (' + brTest.all + ' → ' + brTest.one + ')');
  if (brTest) { const k = await readKpi();
    const shown = num((k.find(x => x.l.indexOf('รถพร้อมขาย') === 0) || {}).v);
    if (shown !== brTest.one) bad('[3] เลือกสาขาแล้วการ์ดโชว์ ' + shown + ' แต่ dUnits() = ' + brTest.one); }
  await p.evaluate(() => { const s = document.getElementById('dBranch'); s.value = ''; s.onchange(); });
  await p.waitForTimeout(300);

  /* 4 · ตัวเลขกลางวงแหวนต้องเป็นค่าเดียวกับความยาวส่วนโค้ง และคำนวณจากระเบียนจริง
     ถ้าใครใส่ % คงที่ไว้ หรือวาดวงกับเขียนเลขคนละค่า ข้อนี้จับได้ */
  const t4 = await p.evaluate(() => {
    const C = 2 * Math.PI * 15.9155;
    return [...document.querySelectorAll('#s-dash svg.rg')].map(sv => {
      const arcs = [...sv.querySelectorAll('circle[stroke-dasharray]')];
      const fg = arcs[arcs.length - 1];                    /* วงหลังสุด = ส่วนที่ทำได้ */
      const len = parseFloat((fg.getAttribute('stroke-dasharray') || '').split(' ')[0]) || 0;
      return { attr: Number(sv.dataset.pct), drawn: Math.round((len + 1.2) / C * 100),
        txt: Number((sv.querySelector('text').textContent || '').replace(/[^\d]/g, '')) };
    });
  });
  if (!t4.length) bad('[4] ไม่เจอวงแหวน svg.rg บนหน้าแรก');
  t4.forEach((r, i) => {
    if (Math.abs(r.drawn - r.attr) > 1) bad('[4] วงที่ ' + (i + 1) + ': ส่วนโค้งวาด ' + r.drawn + '% แต่ค่าที่ส่งเข้าคือ ' + r.attr + '%');
    if (r.txt !== r.attr)               bad('[4] วงที่ ' + (i + 1) + ': ตัวเลขกลางวง ' + r.txt + '% ไม่ตรงกับวง ' + r.attr + '%');
  });
  /* ค่าต้องมาจากระเบียนจริง — คำนวณ % ทะเบียนที่ส่งมอบแล้วเองแล้วเทียบ */
  const t4b = await p.evaluate(() => {
    const all = REGS.filter(r => inScope(r.branch));
    const done = all.filter(r => r.stage === 'ส่งมอบแล้ว').length;
    const sv = document.querySelector('#dReg svg.rg');
    return { want: all.length ? Math.round(done / all.length * 100) : 100,
      got: sv ? Number(sv.dataset.pct) : null };
  });
  if (t4b.got === null)          bad('[4] การ์ดทะเบียนไม่มีวงแหวน (svg.rg)');
  else if (t4b.got !== t4b.want) bad('[4] วงทะเบียนโชว์ ' + t4b.got + '% แต่คิดจากระเบียนจริงได้ ' + t4b.want + '%');

  /* 5 · คิวงานต้องเรียงตามวันครบกำหนดจริง และรายการที่เลยกำหนดต้องมีข้อความ ไม่ใช่แค่จุดแดง */
  const t5 = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('#dQueue .q')].map(r => ({
      when: (r.querySelector('.when') || {}).textContent ? r.querySelector('.when').textContent.trim() : '',
      late: !!r.querySelector('.dot.late') }));
    /* แปลงข้อความเป็นจำนวนวันที่เหลือ เพื่อตรวจว่าเรียงจากน้อยไปมากจริง */
    const n = t => { const m = Number((t.match(/\d+/) || [0])[0]);
      return /เลย/.test(t) ? -m : (/วันนี้/.test(t) ? 0 : m); };
    return { rows, order: rows.map(r => n(r.when)) };
  });
  if (!t5.rows.length) bad('[5] คิวงานว่าง — ไม่มีอะไรให้ตรวจ (ข้อมูลสาธิตควรมีทะเบียนค้าง)');
  for (let i = 1; i < t5.order.length; i++)
    if (t5.order[i] < t5.order[i - 1]) bad('[5] คิวงานเรียงผิด: ' + t5.rows[i - 1].when + ' มาก่อน ' + t5.rows[i].when);
  const lateRows = t5.rows.filter(r => r.late);
  if (!lateRows.length) bad('[5] ไม่มีรายการเลยกำหนดในข้อมูลสาธิตเลย — ด่านนี้จะตรวจอะไรไม่ได้');
  for (const r of lateRows)
    if (!/เลย/.test(r.when)) bad('[5] รายการเลยกำหนดสื่อด้วยจุดสีอย่างเดียว ข้อความเขียนว่า "' + r.when + '"');

  /* 7 · 390px ห้ามเลื่อนซ้าย-ขวา (ตรวจก่อนเปลี่ยนธีม จะได้ไม่ปนกัน) */
  const m = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 390, height: 844 } });
  const mp = await m.newPage();
  mp.on('pageerror', e => errors.push('PAGEERROR(390) ' + e.message));
  for (const id of ['ST2', 'ST3', 'ST8']) {
    await login(mp, id);
    const w = await mp.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth));
    if (w > 390) bad('[7] ' + id + ': หน้าแรกกว้าง ' + w + 'px ที่จอ 390px — มีของล้น');
  }
  await m.close();

  /* 6 · คนไม่มีสิทธิ์ money ต้องเห็น "—" ไม่ใช่ตัวเลขเงิน
     ST3 = เซลล์ (ไม่มีสิทธิ์ money) · ตรวจทั้งการ์ดกำไรและการ์ดเงินค้างรับ */
  const c3 = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } });
  const p3 = await c3.newPage();
  p3.on('pageerror', e => errors.push('PAGEERROR(ST3) ' + e.message));
  await login(p3, 'ST3');
  const t6 = await p3.evaluate(() => {
    const kp = [...document.querySelectorAll('#dKpis .kpi')]
      .map(k => ({ l: k.querySelector('.l').textContent.trim(), v: k.querySelector('.v').textContent.trim() }));
    const gp = kp.find(x => x.l.indexOf('กำไร') === 0);
    const arCard = document.getElementById('dArCard');
    return { noMoney: noMoney(), gp: gp ? gp.v : null,
      arVisible: arCard && getComputedStyle(arCard).display !== 'none',
      arTxt: document.getElementById('dAr').textContent, canAr: canSee('ar') };
  });
  if (!t6.noMoney) bad('[6] ST3 (เซลล์) กลับมีสิทธิ์ money — เลือกบทบาทผิด ด่านนี้ตรวจไม่ได้');
  else {
    if (t6.gp !== '—')                       bad('[6] เซลล์เห็นกำไรขั้นต้นเป็น "' + t6.gp + '" ควรเป็น "—"');
    if (t6.arVisible && /\d{3},\d{3}/.test(t6.arTxt))
                                             bad('[6] เซลล์เห็นตัวเลขเงินค้างรับ: ' + t6.arTxt.slice(0, 60));
    if (!t6.canAr && t6.arVisible)           bad('[6] เซลล์ไม่มีสิทธิ์ ar แต่การ์ดเงินค้างรับยังโชว์อยู่');
  }
  await c3.close();

  /* 8 · สีกราฟต้องอ่านออกบนพื้นการ์ดและพื้นกระดาษ ครบทั้ง 4 ธีม
     เกณฑ์ 3:1 คือเกณฑ์ WCAG ของ "วัตถุกราฟิก" (แท่ง/วง) ไม่ใช่ 4.5:1 ของตัวอักษร */
  const t8 = await p.evaluate(themes => {
    const rgb = s => (s.match(/\d+/g) || [0, 0, 0]).slice(0, 3).map(Number);
    const lum = c => { const [r, g, b] = c.map(v => { v /= 255;
      return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
      return .2126 * r + .7152 * g + .0722 * b; };
    const ratio = (x, y) => { const a = lum(x), b = lum(y);
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); };
    const probe = v => { const d = document.createElement('div'); d.style.color = 'var(' + v + ')';
      document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return rgb(c); };
    const out = [];
    const keep = document.documentElement.dataset.theme || '';
    for (const th of themes) {
      if (th === 'std') delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = th;
      const card = probe('--card'), paper = probe('--paper');
      for (let i = 1; i <= 6; i++) {
        const c = probe('--ch' + i);
        out.push({ th, i, card: +ratio(c, card).toFixed(2), paper: +ratio(c, paper).toFixed(2) });
      }
    }
    if (keep) document.documentElement.dataset.theme = keep; else delete document.documentElement.dataset.theme;
    return out;
  }, THEMES);
  for (const r of t8) {
    if (r.card < 3)  bad('[8] --ch' + r.i + ' ธีม ' + r.th + ': คอนทราสต์กับพื้นการ์ด ' + r.card + ' ต่ำกว่า 3:1');
    if (r.paper < 3) bad('[8] --ch' + r.i + ' ธีม ' + r.th + ': คอนทราสต์กับพื้นกระดาษ ' + r.paper + ' ต่ำกว่า 3:1');
  }

  await ctx.close();
  console.log(fails.length ? 'FAILS:\n' + [...new Set(fails)].join('\n') : 'ALL_CHECKS_PASS');
  console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})();
