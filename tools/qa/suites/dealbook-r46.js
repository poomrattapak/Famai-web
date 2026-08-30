/* ด่าน v1.46 — ป้าย "จองอยู่" + ตัวกรองการจองในหน้าลูกค้าและดีล
   คำสั่งเจ้าของ 28 ส.ค. 2569: "ลูกค้าจอง จะขึ้นอยู่ส่วนไหนครับนอกจากหน้าจอง เพราะอยากให้สามารถ
   ติดตามต่อได้เช่นกัน โดยไม่ทับกับการทำงานของลูกค้าทั่วไป"
   เจ้าของเลือก: **ป้าย "จองอยู่" + ตัวกรองในหน้าลูกค้าและดีล** (ไม่เอาการ์ดหน้าแรก · ไม่เอางานติดตาม
   อัตโนมัติ · ไม่เพิ่มขั้นในแถบความคืบหน้า)
   ล็อก:
   [1] ป้าย "จองอยู่" ขึ้นเฉพาะคนที่มีการจองสถานะ 'จองอยู่' จริง — จำนวนตรงเป๊ะ ไม่ขาดไม่เกิน
   [2] ป้ายอยู่ในแถวเดิม ไม่เพิ่ม <tr> — `.pstep` ยังเท่ากับจำนวนแถว (สัญญา deal-r10)
       และคำว่า "จองอยู่" ไม่ชนคำที่ intent-r32 นับ (เงินสด · เงินผ่อน · ยังไม่ระบุ)
   [3] ตัวกรอง #dlBook: จองอยู่ + ไม่มีการจอง รวมกัน = ไม่กรอง (ไม่มีแถวหล่นหาย ไม่มีแถวนับสองครั้ง)
   [4] `.pstep` เท่ากับจำนวนแถวทุกค่าของตัวกรอง
   [5] **ยกเลิกจองแล้วป้ายหายเอง** — สถานะ derive จาก BOOKINGS สดทุกครั้ง ไม่ใช่ฟิลด์ที่แช่ไว้ (§9g)
   [6] เปิดดีลรายคน (#dlOne) ของคนที่จองอยู่ ต้องเห็นว่ากำลังจองอยู่ พร้อมรถที่จอง
   [7] ไฟล์ส่งออกมีคอลัมน์ "การจอง" และค่าตรงกับจอ (ไฟล์ = จอ)
   [8] แผ่นตัวกรองบนมือถือมี #dlBook ด้วย (ที่ 390 ตัวกรองย้ายเข้าแผ่น)
   [9] ที่ 390 การ์ดมือถือของคนที่จองอยู่ ต้องมีป้ายเหมือนกัน และหน้าไม่ล้นข้าง */
const { chromium, EXE, BASE } = require('./env');

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errors = [];
  const bad = m => fails.push(m);
  const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } });
  ctx.setDefaultTimeout(8000);
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await p.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await p.click('#lgUsers [data-id="ST1"]'); await p.click('#lgGo'); await p.waitForTimeout(400);
  await p.evaluate(() => { window.__F = []; csv = (n, h, r) => window.__F.push({ n: n, h: h, rows: r });
    /* v1.47: ตารางดีลถูกตัดที่การวาด 8 แถว — ด่านนี้นับ "ใครมีป้ายบ้าง" จึงต้องกางให้ครบก่อน
       ไม่งั้นคนที่จองอยู่อาจตกอยู่นอก 8 แถวแรกแล้วด่านแดงทั้งที่โค้ดถูก */
    CAP_OPEN['dlTable'] = true; });

  const has = await p.evaluate(() => !!document.getElementById('dlBook'));
  if (!has) bad('[3] ไม่มีตัวกรอง #dlBook ในหน้าลูกค้าและดีล');

  /* ---------- [1][2] ป้ายขึ้นเฉพาะคนที่จองอยู่ ---------- */
  const g1 = await p.evaluate(() => {
    go('deal'); DEAL_SEL = ''; rDeal();
    /* ค่าที่ตัวกรองตั้งอยู่ตอนเข้าหน้าครั้งแรก — ต้องเป็น "ไม่กรอง" ไม่งั้นตารางรวมที่ทุกคนเห็น
       (และที่ด่านชุดอื่นนับ) จะเปลี่ยนไปเงียบ ๆ · อ่านก่อนที่ข้ออื่นจะไปแตะค่า */
    const initial = document.getElementById('dlBook').value;
    const want = dealAll().filter(d =>
      BOOKINGS.some(x => x.status === 'จองอยู่' && x.custId === d.c.id)).length;
    const trs = [...document.querySelectorAll('#dlTable tbody tr[data-deal]')];
    const withPill = trs.filter(tr => [...tr.querySelectorAll('.pill')]
      .some(x => x.textContent.trim() === 'จองอยู่'));
    /* ป้ายต้องอยู่กับคนที่จองจริง ไม่ใช่แค่จำนวนบังเอิญเท่ากัน */
    const wrong = withPill.filter(tr => !BOOKINGS.some(x => x.status === 'จองอยู่' && x.custId === tr.dataset.deal));
    return { want, initial, got: withPill.length, wrong: wrong.length,
      rows: trs.length, bars: document.querySelectorAll('#dlTable .pstep').length,
      /* คำที่ intent-r32 [6] นับ ต้องไม่มีตัวไหนกลายเป็น "จองอยู่" */
      payWords: [...document.querySelectorAll('#dlTable tbody tr .pill')]
        .map(x => x.textContent.trim())
        .filter(t => ['เงินสด', 'เงินผ่อน', 'ยังไม่ระบุ'].indexOf(t) >= 0).length };
  });
  if (!g1.want) bad('[1] seed ไม่มีลูกค้าที่จองอยู่ — ทดสอบไม่ได้');
  else {
    if (g1.got !== g1.want) bad('[1] ป้าย "จองอยู่" ขึ้น ' + g1.got + ' แถว ควรเป็น ' + g1.want);
    if (g1.wrong) bad('[1] ป้ายขึ้นกับคนที่ไม่ได้จอง ' + g1.wrong + ' แถว');
  }
  if (g1.initial !== '') bad('[3] เข้าหน้ามาแล้วตัวกรองการจองตั้งไว้ที่ "' + g1.initial
    + '" — ค่าเริ่มต้นต้องเป็นไม่กรอง ไม่งั้นตารางรวมเปลี่ยนไปจากเดิม');
  if (g1.bars !== g1.rows) bad('[2] เพิ่มป้ายแล้วแถบความคืบหน้าไม่เท่าจำนวนแถว ('
    + g1.bars + ' แถบ / ' + g1.rows + ' แถว) — น่าจะไปเพิ่ม <tr>');
  if (!g1.payWords) bad('[2] ป้ายเงินสด/ผ่อนหายไปจากตาราง — ป้ายใหม่ไปทับของเดิม');

  /* ---------- [3][4] ตัวกรองสองทางรวมกัน = ไม่กรอง ---------- */
  const g3 = await p.evaluate(() => {
    const el = document.getElementById('dlBook'); if (!el) return { no: 1 };
    const count = v => { el.value = v; el.onchange();
      const trs = [...document.querySelectorAll('#dlTable tbody tr[data-deal]')];
      return { n: trs.length, bars: document.querySelectorAll('#dlTable .pstep').length,
        pill: trs.filter(tr => [...tr.querySelectorAll('.pill')]
          .some(x => x.textContent.trim() === 'จองอยู่')).length }; };
    const all = count(''), on = count('จองอยู่'), off = count('ไม่มีการจอง');
    el.value = ''; el.onchange();
    return { no: 0, all, on, off, opts: [...el.options].map(o => o.value) };
  });
  if (g3.no) bad('[3] ไม่มี #dlBook');
  else {
    if (g3.on.n + g3.off.n !== g3.all.n)
      bad('[3] จองอยู่ (' + g3.on.n + ') + ไม่มีการจอง (' + g3.off.n + ') = ' + (g3.on.n + g3.off.n)
        + ' ไม่เท่ากับไม่กรอง (' + g3.all.n + ')');
    if (!g3.on.n) bad('[3] กรอง "จองอยู่" แล้วไม่เหลือแถวเลย');
    if (g3.on.pill !== g3.on.n) bad('[3] กรอง "จองอยู่" แล้วมีแถวที่ไม่มีป้าย ' + (g3.on.n - g3.on.pill) + ' แถว');
    if (g3.off.pill) bad('[3] กรอง "ไม่มีการจอง" แล้วยังมีแถวที่มีป้าย ' + g3.off.pill + ' แถว');
    if (g3.opts[0] !== '') bad('[3] ค่าเริ่มต้นของ #dlBook ไม่ใช่ "ไม่กรอง" — ตารางรวมจะเปลี่ยนไปจากเดิม');
    [['ไม่กรอง', g3.all], ['จองอยู่', g3.on], ['ไม่มีการจอง', g3.off]].forEach(([n, r]) => {
      if (r.bars !== r.n) bad('[4] ค่ากรอง "' + n + '": แถบ ' + r.bars + ' อัน แต่ ' + r.n + ' แถว');
    });
  }

  /* ---------- [6] ดีลรายคน ---------- */
  const g6 = await p.evaluate(() => {
    const bk = BOOKINGS.find(x => x.status === 'จองอยู่' && x.custId);
    if (!bk) return { skip: 1 };
    DEAL_SEL = bk.custId; rDeal();
    const t = document.getElementById('dlOne').textContent;
    const u = UNITS.find(x => x.id === bk.unitId) || {};
    /* ป้ายต้องคงรูปเม็ดยา — .dlwho span{display:block} จับ span.pill ด้วยถ้าไม่กันไว้
       แล้วป้ายจะยืดเต็มบรรทัดจนดูเหมือนช่องกรอก (บั๊กชนิดเดียวกับ .txt span ในไฟล์ PDF) */
    const one = document.getElementById('dlOne');
    const pl = [...one.querySelectorAll('.pill')].find(x => x.textContent.trim() === 'จองอยู่');
    const host = pl && pl.parentElement;
    const r = { skip: 0, label: t.indexOf('จองอยู่') >= 0,
      unit: u.model ? t.indexOf(u.model) >= 0 : true,
      pill: !!pl,
      wide: (pl && host) ? (pl.offsetWidth > host.clientWidth * 0.6) : false,
      /* ห้ามมีสองบรรทัดที่ขัดกันเองบนจอเดียว */
      lie: t.indexOf('ยังไม่ได้จอง') >= 0 };
    DEAL_SEL = ''; rDeal();
    return r;
  });
  if (g6.skip) bad('[6] seed ไม่มีการจองที่ผูกกับลูกค้า');
  else {
    if (!g6.label) bad('[6] เปิดดีลรายคนของคนที่จองอยู่ แล้วไม่เห็นว่ากำลังจองอยู่');
    if (!g6.unit) bad('[6] ไม่บอกว่าจองรถคันไหน — ติดตามต่อไม่ได้');
    if (!g6.pill) bad('[6] ไม่มีป้าย .pill "จองอยู่" ในดีลรายคน (เป็นข้อความเปล่า ไม่ใช่ป้าย)');
    if (g6.wide) bad('[6] ป้าย "จองอยู่" ยืดเต็มบรรทัดจนดูเหมือนช่องกรอก — เสียรูปเม็ดยา');
    if (g6.lie) bad('[6] จอเดียวกันเขียนทั้ง "จองอยู่" และ "ยังไม่ได้จอง" — ขัดกันเอง');
  }

  /* ---------- [5] ยกเลิกจองแล้วป้ายหายเอง ---------- */
  const g5 = await p.evaluate(() => {
    const bk = BOOKINGS.find(x => x.status === 'จองอยู่' && x.custId);
    if (!bk) return { skip: 1 };
    const cid = bk.custId;
    const pilled = () => { rDeal();
      const tr = document.querySelector('#dlTable tbody tr[data-deal="' + cid + '"]');
      return tr ? [...tr.querySelectorAll('.pill')].some(x => x.textContent.trim() === 'จองอยู่') : null; };
    const before = pilled();
    const ok = bookCancel(bk.id, 'ทดสอบว่าป้ายหายเอง');
    const after = pilled();
    /* คืนสภาพ — ด่านข้ออื่นและชุดอื่นใช้ seed เดิม */
    bk.status = 'จองอยู่'; delete bk.cancelAt; delete bk.cancelReason; delete bk.refunded;
    const u = UNITS.find(x => x.id === bk.unitId); if (u) u.status = 'reserved';
    rDeal();
    return { skip: 0, before, ok, after, back: pilled() };
  });
  if (g5.skip) bad('[5] seed ไม่มีการจองที่ผูกกับลูกค้า');
  else {
    if (!g5.before) bad('[5] เตรียมเคสไม่ได้ — ก่อนยกเลิกยังไม่มีป้าย');
    if (!g5.ok) bad('[5] ยกเลิกการจองไม่สำเร็จ');
    if (g5.after) bad('[5] ยกเลิกจองแล้วป้ายยังอยู่ — สถานะถูกแช่เป็นฟิลด์แทนที่จะคำนวณจาก BOOKINGS สด');
    if (!g5.back) bad('[5] คืนสภาพ seed ไม่ได้');
  }

  /* ---------- [7] ไฟล์ส่งออก = จอ ---------- */
  const g7 = await p.evaluate(() => {
    go('deal'); DEAL_SEL = ''; rDeal();
    const n0 = window.__F.length;
    document.querySelector('#expDeal').click();
    const f = window.__F[n0]; if (!f) return { none: 1 };
    const i = f.h.indexOf('การจอง');
    if (i < 0) return { none: 0, nocol: 1, head: f.h.join(' · ') };
    const want = dealRows().map(d =>
      BOOKINGS.some(x => x.status === 'จองอยู่' && x.custId === d.c.id) ? 'จองอยู่' : '');
    return { none: 0, nocol: 0, rows: f.rows.length, wantN: want.length,
      match: f.rows.every((r, k) => String(r[i] || '') === want[k]),
      hits: f.rows.filter(r => String(r[i] || '') === 'จองอยู่').length,
      wantHits: want.filter(x => x).length };
  });
  if (g7.none) bad('[7] กด #expDeal แล้วไม่มีไฟล์ออก');
  else if (g7.nocol) bad('[7] ไฟล์ส่งออกไม่มีคอลัมน์ "การจอง" (หัวไฟล์: ' + g7.head + ')');
  else {
    if (g7.rows !== g7.wantN) bad('[7] ไฟล์ได้ ' + g7.rows + ' แถว ควรเป็น ' + g7.wantN);
    if (!g7.match) bad('[7] ค่าคอลัมน์ "การจอง" ไม่ตรงกับที่จอแสดง');
    if (g7.hits !== g7.wantHits) bad('[7] ไฟล์บอกว่าจองอยู่ ' + g7.hits + ' ราย ควรเป็น ' + g7.wantHits);
  }

  /* ---------- [8][9] มือถือ ---------- */
  await p.setViewportSize({ width: 390, height: 844 });
  await p.evaluate(() => { go('deal'); DEAL_SEL = ''; rDeal(); });
  await p.waitForTimeout(300);
  const g8 = await p.evaluate(() => {
    openFilters('deal');
    const inSheet = !!document.querySelector('#fsBody #dlBook');
    closeFilters();
    const cards = [...document.querySelectorAll('#dlTable .crow[data-deal]')];
    const pilled = cards.filter(c => [...c.querySelectorAll('.pill')]
      .some(x => x.textContent.trim() === 'จองอยู่'));
    const want = dealRows().filter(d =>
      BOOKINGS.some(x => x.status === 'จองอยู่' && x.custId === d.c.id)).length;
    return { inSheet, cards: cards.length, got: pilled.length, want,
      body: document.body.scrollWidth - innerWidth };
  });
  if (!g8.inSheet) bad('[8] แผ่นตัวกรองบนมือถือไม่มี #dlBook — กรองการจองบนมือถือไม่ได้');
  if (!g8.cards) bad('[9] ที่ 390 ไม่มีการ์ดมือถือให้ตรวจ');
  else if (g8.got !== g8.want) bad('[9] การ์ดมือถือมีป้าย ' + g8.got + ' ใบ ควรเป็น ' + g8.want);
  if (g8.body > 1) bad('[9] หน้าเลื่อนซ้าย-ขวาได้ ' + g8.body + 'px ที่ 390');

  await b.close();
  if (errors.length) fails.push(...errors);
  if (fails.length) { console.log('FAILS:'); fails.forEach(f => console.log(f)); process.exit(1); }
  console.log('ALL_CHECKS_PASS (dealbook-r46: 9 ข้อ)');
})().catch(e => { console.error('SUITE_CRASH', e); process.exit(2); });
