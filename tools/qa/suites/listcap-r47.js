/* ด่าน v1.47 — แก้ "หลายส่วนที่ยาวเกินไป"
   คำสั่งเจ้าของ 28 ส.ค. 2569: "ตอนนี้จะมีหลายส่วนที่ยาวเกินไป เช่นช่องข้อมูลที่ให้เลื่อนเลือกลูกค้า
   หรือส่วนเลื่อนเลือกรถ ยาวจนผมเลื่อนไม่ไหว หรือแม้แต่ส่วนการ์ดในแต่ละหน้าที่มีหลายการ์ดจนทำให้
   หน้ายาวขึ้นเยอะก็ตาม ... คิด solution ที่จะแก้ไขได้ เพื่อเพิ่ม ux"
   เจ้าของเลือก: **แผงค้นหา + แสดงบางส่วน + ดูทั้งหมด**
   ล็อก:
   [1] แปลงคำบ่นเป็นตัวเลข — ที่ 390 หน้าที่เคยยาวสุดต้องสูงไม่เกิน 3.5 เท่าของจอ
   [2] ตารางที่ใส่ cap วาดไม่เกินจำนวนที่ตั้ง และมีปุ่มบอก "ซ่อนอยู่กี่รายการ" เป็นข้อความ
   [3] กด "ดูทั้งหมด" → เห็นครบทุกแถว · กด "ย่อ" → กลับมาเท่าเดิม
   [4] หน้ากากเลือกคันรถบอก "คันที่เลือกอยู่" + "กี่คันให้เลือก" เป็นข้อความ ไม่ใช่สีล้วน
   [5] **<select> ตัวจริงยังมี option ครบทุกตัว และ .value ยังเป็นค่าที่ฟังก์ชันบันทึกอ่านได้**
       (สัญญาที่ picker-r33 / modelsug-r40 / booking-r37 / money-r16 พึ่งอยู่)
   [6] เปิดแผงเลือกคัน → พิมพ์กรอง → เลือก → select เปลี่ยนค่าจริง และ onchange ของแอปทำงาน
   [7] markReq ยังแปะดอกจันให้ #tUnit ได้ ทั้งที่ถูกห่อด้วย .upick แล้ว
   [8] ไฟล์ส่งออกยังครบทุกแถว แม้จอจะถูก cap อยู่ (ตัดที่การวาด ไม่ได้ตัดข้อมูล)
   [9] ที่ 390 ไม่ล้นข้าง และปุ่มหน้ากากสูงพอให้นิ้วแตะ (≥44px) */
const { chromium, EXE, BASE } = require('./env');

/* หน้าที่วัดความสูง — ตัวเลขคือเพดาน "กี่เท่าของความสูงจอ" */
const TALL = [['stock', 3.5], ['deal', 3.5], ['hr', 3.5], ['payroll', 3.5], ['attend', 3.5]];
/* ช่องเลือกคันรถทั้งสี่จุด: [หน้า, id ของ select, ตัวเปิดหน้า, นิพจน์ที่คืน "รายการที่หน้านั้นเสนอได้จริง"]
   นิพจน์สุดท้ายคือหัวใจของข้อ [5] — ถ้าใครเผลอตัด option ให้สั้นลงเพื่อให้ดรอปดาวน์สั้น
   ค่าที่ฟังก์ชันบันทึกอ่านจะหายไปเงียบ ๆ ทั้งที่หน้าตาดูดี */
const PICKS = [
  ['sell', 'sUnit', null, 'vehCascadeFill(SELL_CAS, sellPool).length'],
  ['booking', 'bkUnit', null, 'vehCascadeFill(BK_CAS, bookPool).length'],
  ['transfer', 'tUnit', null, "UNITS.filter(u=>u.status==='available'&&inScope(u.branch)).length"],
  ['invoice', 'wsUnit', '#ivTabs [data-p="iv2"]',
    "UNITS.filter(u=>u.status==='available' && u.branch===document.getElementById('wsBranch').value && !WS_CART.some(x=>x.unitId===u.id)).length"]
];

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errors = [];
  const bad = m => fails.push(m);

  /* ---------- จอคอม: cap · หน้ากาก · option ครบ ---------- */
  const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } });
  ctx.setDefaultTimeout(8000);
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await p.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await p.click('#lgUsers [data-id="ST1"]'); await p.click('#lgGo'); await p.waitForTimeout(400);
  await p.evaluate(() => { window.__F = []; csv = (n, h, r) => window.__F.push({ n: n, h: h, rows: r }); });

  const api = await p.evaluate(() => {
    const m = [];
    if (typeof capFoot !== 'function') m.push('capFoot');
    if (typeof capSlice !== 'function') m.push('capSlice');
    if (typeof upickOpen !== 'function') m.push('upickOpen');
    if (typeof upickSync !== 'function') m.push('upickSync');
    if (typeof CAP_OPEN !== 'object') m.push('CAP_OPEN');
    return m;
  });
  if (api.length) {
    bad('ยังไม่มี: ' + api.join(' · '));
    await b.close(); console.log('FAILS:'); fails.forEach(f => console.log(f)); process.exit(1);
  }

  /* ---------- [2][3] cap ทำงาน + ปุ่มบอกจำนวนจริง + กางแล้วเห็นครบ ---------- */
  const g2 = await p.evaluate(() => {
    const out = [];
    const check = (page, tid, sub) => {
      go(page, sub || undefined);
      const t = document.getElementById(tid);
      if (!t) { out.push({ tid, missing: 1 }); return; }
      const rows = () => [...t.querySelectorAll('tbody tr')].filter(r => !r.querySelector('.empty')).length;
      const cap = rows();
      const foot = document.querySelector('.capmore[data-cap="' + tid + '"]');
      if (!foot) { out.push({ tid, cap, nofoot: 1 }); return; }
      const txt = foot.textContent;
      const nums = (txt.match(/\d+/g) || []).map(Number);
      CAP_OPEN[tid] = true; refreshAll();
      const full = rows();
      const foot2 = document.querySelector('.capmore[data-cap="' + tid + '"]');
      /* อ่านข้อความทันที — ย่อกลับแล้วปุ่มเดิมจะเปลี่ยนข้อความ อ่านทีหลังได้ของผิด */
      const txt2 = foot2 ? foot2.textContent : '';
      CAP_OPEN[tid] = false; refreshAll();
      const back = rows();
      out.push({ tid, cap, full, back, txt: txt.trim(),
        saysTotal: nums.indexOf(full) >= 0, saysHidden: nums.indexOf(full - cap) >= 0,
        canFold: /ย่อ/.test(txt2) });
    };
    check('stock', 'stTable', 'table');
    check('stock', 'stGrp', 'grp');
    check('deal', 'dlTable');
    check('deal', 'dlTasks');
    check('hr', 'attTable');
    check('payroll', 'prTable');
    go('stock', 'gal');
    return out;
  });
  g2.forEach(r => {
    if (r.missing) { bad('[2] ไม่มีตาราง #' + r.tid); return; }
    if (r.nofoot) { bad('[2] #' + r.tid + ' วาด ' + r.cap + ' แถว แต่ไม่มีปุ่ม "ดูทั้งหมด"'); return; }
    if (r.full <= r.cap) bad('[2] #' + r.tid + ': ข้อมูลไม่ยาวพอจะพิสูจน์ cap (' + r.full + ' แถว)');
    if (!r.saysTotal) bad('[2] #' + r.tid + ': ปุ่มไม่บอกจำนวนทั้งหมด (' + r.full + ') — "' + r.txt + '"');
    if (!r.saysHidden) bad('[2] #' + r.tid + ': ปุ่มไม่บอกจำนวนที่ซ่อน (' + (r.full - r.cap) + ') — "' + r.txt + '"');
    if (r.back !== r.cap) bad('[3] #' + r.tid + ': กางแล้วย่อกลับไม่เท่าเดิม (' + r.cap + ' → ' + r.back + ')');
    if (!r.canFold) bad('[3] #' + r.tid + ': กางแล้วไม่มีปุ่มย่อกลับ');
  });

  /* ---------- [2b] แกลเลอรีสต๊อก (การ์ด ไม่ใช่ตาราง) ---------- */
  const g2b = await p.evaluate(() => {
    go('stock', 'gal');
    const n = () => document.querySelectorAll('#stGal .gcard').length;
    const cap = n();
    const f = document.querySelector('.capmore[data-cap="stGal"]');
    const txt = f ? f.textContent.trim() : '';
    CAP_OPEN['stGal'] = true; refreshAll();
    const full = n();
    /* สัญญาที่เจ้าของสั่งเอง (mcolor-r31 ข้อ 11): กางครบแล้วผลรวมต้องเท่ากับจำนวนรถจริงเป๊ะ */
    const sum = [...document.querySelectorAll('#stGal .gqty')].reduce((t, x) => t + (+x.textContent), 0);
    const want = stList().length;
    CAP_OPEN['stGal'] = false; refreshAll();
    return { cap, full, txt, sum, want, back: n() };
  });
  if (!g2b.txt) bad('[2] แกลเลอรีสต๊อกไม่มีปุ่ม "ดูทั้งหมด"');
  else {
    if (g2b.full <= g2b.cap) bad('[2] แกลเลอรีมีการ์ดไม่พอจะพิสูจน์ cap (' + g2b.full + ' ใบ)');
    if (g2b.txt.indexOf(String(g2b.full)) < 0) bad('[2] ปุ่มแกลเลอรีไม่บอกจำนวนทั้งหมด — "' + g2b.txt + '"');
    if (g2b.back !== g2b.cap) bad('[3] แกลเลอรี: ย่อกลับไม่เท่าเดิม');
  }
  if (g2b.sum !== g2b.want)
    bad('[2] กางแกลเลอรีครบแล้วผลรวมจำนวนรถ ' + g2b.sum + ' ไม่เท่ากับสต๊อกจริง ' + g2b.want + ' — รถนับเบิ้ล/หาย');

  /* ---------- [4][5] หน้ากาก + option ยังครบ ---------- */
  const g4 = await p.evaluate(PICKS_ => {
    return PICKS_.map(([page, id, sub, poolExpr]) => {
      go(page, sub || undefined);
      const sel = document.getElementById(id);
      if (!sel) return { id, missing: 1 };
      const wrap = sel.closest('.upick');
      const btn = wrap && wrap.querySelector('.upbtn');
      const opts = [...sel.options].filter(o => o.value);
      const cs = getComputedStyle(sel);
      return { id, missing: 0,
        wrapped: !!wrap, btn: !!btn,
        txt: btn ? btn.textContent.trim() : '',
        saysCount: btn ? btn.textContent.indexOf(String(opts.length)) >= 0 : false,
        saysPick: btn && opts.length ? btn.textContent.indexOf(
          ([...sel.options].find(o => o.value === sel.value) || {}).text || ' ') >= 0 : true,
        opts: opts.length, pool: eval(poolExpr), value: sel.value,
        /* ห้ามซ่อนด้วย display:none — วัดขนาดไม่ได้ และ sUnitSet ต้องยังตั้งค่าได้ */
        display: cs.display, opacity: cs.opacity, events: cs.pointerEvents };
    });
  }, PICKS);
  g4.forEach(r => {
    if (r.missing) { bad('[4] ไม่มี #' + r.id); return; }
    if (!r.wrapped) { bad('[4] #' + r.id + ' ไม่ได้ถูกห่อด้วย .upick'); return; }
    if (!r.btn) { bad('[4] #' + r.id + ' ไม่มีปุ่มหน้ากาก .upbtn'); return; }
    if (!r.opts) bad('[5] #' + r.id + ' ไม่มี option ให้เลือกเลย — ทดสอบไม่ได้');
    else {
      if (!r.saysCount) bad('[4] #' + r.id + ' ปุ่มไม่บอกจำนวนคันที่เลือกได้ (' + r.opts + ') — "' + r.txt + '"');
      if (!r.saysPick) bad('[4] #' + r.id + ' ปุ่มไม่บอกคันที่เลือกอยู่ — "' + r.txt + '"');
    }
    if (r.display === 'none') bad('[5] #' + r.id + ' ถูกซ่อนด้วย display:none — วัดขนาดไม่ได้และตั้งค่าจากภายนอกพัง');
    /* หัวใจของรอบนี้: หน้ากากทำให้ดรอปดาวน์ "ดูสั้น" ได้ แต่ห้ามทำให้ option "หายจริง" */
    if (r.opts !== r.pool)
      bad('[5] #' + r.id + ' มี option ' + r.opts + ' ตัว แต่หน้านี้เสนอรถได้ ' + r.pool
        + ' คัน — option ถูกตัดหาย ค่าที่ฟังก์ชันบันทึกอ่านจะหายตาม');
  });

  /* ---------- [6] เปิดแผง → พิมพ์กรอง → เลือก แล้วแอปรู้เรื่อง ---------- */
  const g6 = await p.evaluate(() => {
    go('sell');
    const sel = document.getElementById('sUnit');
    const opts = [...sel.options].filter(o => o.value);
    if (opts.length < 2) return { skip: 1 };
    const want = opts[opts.length - 1];
    sel.value = opts[0].value; if (sel.onchange) sel.onchange();
    document.querySelector('#sUnit').closest('.upick').querySelector('.upbtn').click();
    const q = document.getElementById('upQ');
    if (!q) return { noq: 1 };
    const nAll = document.querySelectorAll('#upList [data-uv]').length;
    q.value = want.text.split(' ')[0]; q.oninput();
    const nHit = document.querySelectorAll('#upList [data-uv]').length;
    const row = document.querySelector('#upList [data-uv="' + want.value + '"]');
    if (!row) return { norow: 1, nAll, nHit };
    let fired = 0; const keep = sel.onchange; sel.onchange = () => { fired++; if (keep) keep(); };
    row.click();
    sel.onchange = keep;
    const closed = !document.getElementById('drw').classList.contains('on');
    const face = sel.closest('.upick').querySelector('.upbtn').textContent;
    return { skip: 0, nAll, nHit, value: sel.value, want: want.value, fired, closed,
      faceOk: face.indexOf(want.text) >= 0 };
  });
  if (g6.skip) bad('[6] รถว่างน้อยเกินไป ทดสอบไม่ได้');
  else if (g6.noq) bad('[6] เปิดแผงแล้วไม่มีช่องพิมพ์ค้นหา #upQ');
  else if (g6.norow) bad('[6] แผงไม่มีแถวของคันที่ต้องการ (ทั้งหมด ' + g6.nAll + ' · หลังกรอง ' + g6.nHit + ')');
  else {
    if (g6.nAll < 2) bad('[6] แผงแสดงรถแค่ ' + g6.nAll + ' คัน');
    if (g6.nHit >= g6.nAll) bad('[6] พิมพ์กรองแล้วรายการไม่ลดลง (' + g6.nAll + ' → ' + g6.nHit + ')');
    if (g6.value !== g6.want) bad('[6] เลือกจากแผงแล้ว select ไม่เปลี่ยนค่า');
    if (!g6.fired) bad('[6] เลือกจากแผงแล้ว onchange ของแอปไม่ทำงาน — ราคา/สรุปดีลจะไม่อัปเดต');
    if (!g6.closed) bad('[6] เลือกแล้วแผงไม่ปิด');
    if (!g6.faceOk) bad('[6] เลือกแล้วปุ่มหน้ากากไม่อัปเดตเป็นคันใหม่');
  }

  /* ---------- [7] ดอกจันของ #tUnit ---------- */
  const g7 = await p.evaluate(() => {
    go('transfer'); markReq();
    const sel = document.getElementById('tUnit');
    const host = sel.closest('.upick') || sel;
    let lab = null;
    for (let s = host.previousElementSibling; s; s = s.previousElementSibling)
      if (s.matches && s.matches('label.fl')) { lab = s; break; }
    return { inReq: REQ.indexOf('tUnit') >= 0, lab: !!lab, rq: !!(lab && lab.querySelector('.rq')) };
  });
  if (!g7.inReq) bad('[7] tUnit หลุดออกจาก REQ');
  else if (!g7.lab) bad('[7] หา label ของ #tUnit ไม่เจอหลังห่อ .upick');
  else if (!g7.rq) bad('[7] #tUnit อยู่ใน REQ แต่ป้ายไม่มีดอกจัน — markReq ไต่ไม่ถึงหลังห่อ .upick');

  /* ---------- [8] ไฟล์ส่งออกยังครบ ---------- */
  const g8 = await p.evaluate(() => {
    go('deal'); DEAL_SEL = ''; rDeal();
    const shown = [...document.querySelectorAll('#dlTable tbody tr[data-deal]')].length;
    const n0 = window.__F.length;
    document.querySelector('#expDeal').click();
    const f = window.__F[n0];
    return { shown, file: f ? f.rows.length : -1, want: dealRows().length };
  });
  if (g8.file !== g8.want) bad('[8] ไฟล์ส่งออกได้ ' + g8.file + ' แถว ควรครบ ' + g8.want);
  if (g8.shown >= g8.want) bad('[8] จอไม่ได้ถูก cap เลย (' + g8.shown + '/' + g8.want + ') — พิสูจน์ไม่ได้ว่าไฟล์ครบทั้งที่จอสั้น');
  await ctx.close();

  /* ---------- [1][9] มือถือ ---------- */
  const m = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 390, height: 844 }, hasTouch: true });
  const q = await m.newPage();
  q.on('pageerror', e => errors.push('390 PAGEERROR ' + e.message));
  await q.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await q.click('#lgUsers [data-id="ST1"]'); await q.click('#lgGo'); await q.waitForTimeout(450);
  const tallOut = [];
  for (const [page, cap] of TALL) {
    await q.evaluate(x => go(x), page); await q.waitForTimeout(350);
    const r = await q.evaluate(() => ({ h: document.body.scrollHeight, vh: innerHeight,
      over: document.body.scrollWidth - innerWidth }));
    const n = Math.round(r.h / r.vh * 10) / 10;
    tallOut.push(page + ' ' + n);
    if (n > cap) bad('[1] หน้า ' + page + ' สูง ' + n + ' เท่าของจอ เกินเพดาน ' + cap);
    if (r.over > 1) bad('[9] หน้า ' + page + ' ล้นข้าง ' + r.over + 'px');
  }
  /* หน้าที่มีหน้ากากต้องไม่ล้นข้างด้วย — ปุ่มที่มีข้อความยาวแบบ nowrap ดันช่องกริดของฟอร์ม
     ให้กว้างเกินจอได้ง่ายมาก (เจอจริงตอนทำรอบนี้: หน้าขายรถ 420px · โอนย้าย 503px) */
  const g9 = await q.evaluate(PICKS_ => {
    const over = [];
    PICKS_.forEach(([page, id, sub]) => {
      go(page, sub || undefined);
      const d = document.body.scrollWidth - innerWidth;
      if (d > 1) over.push(page + ' ' + d + 'px');
    });
    go('sell');
    const btn = document.querySelector('#sUnit').closest('.upick').querySelector('.upbtn');
    return { h: btn.offsetHeight, w: btn.offsetWidth, over };
  }, PICKS);
  if (g9.h < 44) bad('[9] ปุ่มหน้ากากสูงแค่ ' + g9.h + 'px — นิ้วแตะพลาด (ต้อง ≥44)');
  if (g9.over.length) bad('[9] หน้าที่มีหน้ากากเลือกรถล้นข้างที่ 390: ' + g9.over.join(' · '));
  await m.close();

  await b.close();
  if (errors.length) fails.push(...errors);
  if (fails.length) { console.log('FAILS:'); fails.forEach(f => console.log(f)); process.exit(1); }
  console.log('ALL_CHECKS_PASS (listcap-r47: 9 ข้อ) · ความสูงที่ 390: ' + tallOut.join(' · '));
})().catch(e => { console.error('SUITE_CRASH', e); process.exit(2); });
