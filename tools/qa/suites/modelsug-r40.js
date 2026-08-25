/* ด่าน v1.40 — แผงรายชื่อรุ่นใต้ช่องค้นหารถ (คำสั่งเจ้าของ 25 ส.ค. 2569:
   "หน้าขายรถ ส่วนรายละเอียดการขาย ช่อง search อยากให้พอกดช่องนั้น จะมีรายชื่อรุ่นขึ้นมาให้กดครับ")
   ทำที่โค้ดกลาง vehCascadeWire/vehCascadeFill → หน้าจอง (#bkQ) ได้แผงเดียวกันอัตโนมัติ
   ล็อก:
   [1] คลิก #svQ → #svQSug โชว์รายชื่อรุ่นครบตาม sellPool + จำนวนคันต่อรุ่นเป็นข้อความ
   [2] กดชื่อรุ่นในแผง → #svModel ถูกตั้ง · #sUnit เหลือเฉพาะคันรุ่นนั้น · แผงปิด · #svQ ว่าง
   [3] พิมพ์บางส่วนของชื่อรุ่น (สั้นกว่าเกณฑ์ back-fill) → รายชื่อกรองตาม ไม่สนตัวพิมพ์เล็กใหญ่
   [3b] พิมพ์ข้อความที่ไม่แมตช์อะไรเลย → แผงปิด ไม่โชว์กล่องเปล่า
   [4] back-fill เดิมชนะเสมอ: เปิดแผงอยู่แล้วพิมพ์เลขถังเต็ม → ช่องบนเติม + #sUnit ชี้คัน + แผงปิด
   [5] blur ช่องค้นหา → แผงปิดเอง
   [6] หน้าจอง: คลิก #bkQ → #bkQSug โชว์จาก bookPool · เลือกแล้ว #bkModel ตั้ง + แผงปิด
   [7] ข้อความในแผงห้ามมีราคา (เจตนาเดียวกับ K12 ของ money-r16 — คนไม่มีสิทธิ์ money ก็เห็นแผงนี้)
   [8] v1.40.1 (เจ้าของ: "พอพิมพ์ ข้อมูลไม่ขึ้น"): พิมพ์เลขที่แมตช์หลายคัน → แผงโชว์แถวคัน [data-u]
       ครบทุกคันที่แมตช์ · ไม่เดาเติมคันแรกลง select · แตะแถวคันแล้วเลือกคันนั้นทั้งกระบวน + แผงปิด */
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

  /* ---------- [1] คลิกช่องค้นหา → แผงรายชื่อรุ่นโชว์ครบ ---------- */
  await p.evaluate(() => go('sell')); await p.waitForTimeout(250);
  const has = await p.evaluate(() => !!document.getElementById('svQSug'));
  if (!has) bad('[1] ไม่มีแผง #svQSug ในหน้าขาย');
  else {
    await p.click('#svQ'); await p.waitForTimeout(150);
    const g1 = await p.evaluate(() => {
      const box = document.getElementById('svQSug');
      const rows = [...box.querySelectorAll('.si[data-m]')];   /* v1.40.1: แถวคัน [data-u] แยกนับ */
      const cnt = {};
      sellPool().forEach(u => { if (u.model) cnt[u.model] = (cnt[u.model] || 0) + 1; });
      const want = Object.keys(cnt).sort((a, b2) => a.localeCompare(b2, 'th'));
      return { open: box.style.display !== 'none',
        got: rows.map(r => r.querySelector('b').textContent),
        want,
        cntBad: rows.filter(r => {
          const m = r.querySelector('b').textContent;
          const sp = r.querySelector('.sp2');
          return !sp || sp.textContent !== cnt[m] + ' คัน';
        }).length,
        text: box.textContent };
    });
    if (!g1.open) bad('[1] คลิกช่องค้นหาแล้วแผงไม่เปิด');
    else {
      if (g1.got.join('|') !== g1.want.join('|'))
        bad('[1] รายชื่อรุ่นไม่ครบ/ไม่เรียง ได้ [' + g1.got.join(',') + '] ควรเป็น [' + g1.want.join(',') + ']');
      if (g1.cntBad) bad('[1] ' + g1.cntBad + ' แถวที่จำนวนคันไม่ตรง pool หรือไม่มีคำว่า "คัน"');
      /* ---------- [7] ห้ามมีราคาในแผง — คนไม่มีสิทธิ์ money เห็นแผงนี้ด้วย ---------- */
      if (/฿|,\d{3}/.test(g1.text)) bad('[7] มีตัวเลขหน้าตาเหมือนราคาในแผงรายชื่อรุ่น');
    }

    /* ---------- [2] กดชื่อรุ่น → ตัวกรองตั้ง + คันเหลือเฉพาะรุ่น + แผงปิด ---------- */
    const g2 = await p.evaluate(() => {
      const pool = sellPool();
      const cnt = {}; pool.forEach(u => { cnt[u.model] = (cnt[u.model] || 0) + 1; });
      const pick = Object.keys(cnt).find(m => cnt[m] < pool.length);   /* รุ่นที่ไม่ครอบทั้ง pool */
      if (!pick) return { skip: true };
      const row = [...document.querySelectorAll('#svQSug .si')]
        .find(r => r.querySelector('b').textContent === pick);
      if (!row) return { skip: true, noRow: pick };
      row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      const opts = [...document.querySelectorAll('#sUnit option')].map(o => o.value).filter(Boolean).sort();
      const want = pool.filter(u => u.model === pick).map(u => u.id).sort();
      const r = { skip: false, pick, model: $('#svModel').value, q: $('#svQ').value,
        closed: document.getElementById('svQSug').style.display === 'none',
        opts: opts.join(','), want: want.join(',') };
      ['svQ', 'svModel', 'svVariant', 'svColor'].forEach(k => $('#' + k).value = ''); rSell();
      return r;
    });
    if (g2.skip) bad('[2] ' + (g2.noRow ? 'ไม่เจอแถวของรุ่น ' + g2.noRow + ' ในแผง' : 'seed มีรุ่นเดียว — เคสแยกไม่ออก'));
    else {
      if (g2.model !== g2.pick) bad('[2] กดรุ่น ' + g2.pick + ' แล้ว #svModel เป็น "' + g2.model + '"');
      if (g2.opts !== g2.want) bad('[2] กดรุ่นแล้ว #sUnit ไม่ได้เหลือเฉพาะคันรุ่นนั้น');
      if (!g2.closed) bad('[2] เลือกรุ่นแล้วแผงไม่ปิด');
      if (g2.q !== '') bad('[2] เลือกรุ่นแล้ว #svQ ไม่ถูกล้าง (ค้าง "' + g2.q + '")');
    }

    /* ---------- [3] พิมพ์แล้วรายชื่อกรองตาม (สั้นกว่าเกณฑ์ back-fill · สลับตัวพิมพ์) ---------- */
    const g3 = await p.evaluate(() => {
      const models = [...new Set(sellPool().map(u => u.model))];
      let sub = null, hitM = [], missM = [];
      outer: for (const m of models) {                       /* หา substring 2 ตัวที่แยกรุ่นได้จริง */
        const low = m.toLowerCase();
        for (let i = 0; i + 2 <= low.length; i++) {
          const s = low.slice(i, i + 2).trim(); if (s.length < 2) continue;
          const hit = models.filter(x => x.toLowerCase().indexOf(s) >= 0);
          if (hit.length < models.length) { sub = s; hitM = hit.sort(); break outer; }
        }
      }
      if (!sub) return { skip: true };
      const q = $('#svQ');
      q.value = sub.toUpperCase();                            /* สลับ case — ต้องยังกรองเจอ */
      q.oninput();
      const box = document.getElementById('svQSug');
      const got = [...box.querySelectorAll('.si[data-m] b')].map(x => x.textContent).sort();
      const r = { skip: false, sub, open: box.style.display !== 'none',
        got: got.join(','), want: hitM.join(',') };
      q.value = ''; rSell();
      return r;
    });
    if (g3.skip) bad('[3] หา substring แยกรุ่นไม่ได้จาก seed — เคสทดสอบไม่ทำงาน');
    else {
      if (!g3.open) bad('[3] พิมพ์ "' + g3.sub + '" แล้วแผงไม่เปิด');
      else if (g3.got !== g3.want)
        bad('[3] พิมพ์ "' + g3.sub + '" ได้ [' + g3.got + '] ควรเป็น [' + g3.want + '] — รายชื่อไม่กรองตามที่พิมพ์');
    }

    /* ---------- [3b] พิมพ์ไม่แมตช์อะไรเลย → แผงปิด ---------- */
    const g3b = await p.evaluate(() => {
      const q = $('#svQ');
      q.value = 'ไม่มีรุ่นนี้แน่นอน'; q.oninput();             /* ไทย ≥3 ตัว — back-fill วิ่งแต่ไม่เจอ */
      const closed = document.getElementById('svQSug').style.display === 'none';
      q.value = ''; rSell();
      return closed;
    });
    if (!g3b) bad('[3b] พิมพ์ข้อความไม่แมตช์แล้วแผงยังเปิด (ควรปิด ไม่โชว์กล่องเปล่า)');

    /* ---------- [4] back-fill เดิมชนะ: เปิดแผงแล้วพิมพ์เลขถังเต็ม ---------- */
    await p.click('#svQ'); await p.waitForTimeout(150);
    const g4 = await p.evaluate(() => {
      const opened = document.getElementById('svQSug').style.display !== 'none';
      const u = sellPool()[0];
      const q = $('#svQ'); q.value = u.frame; q.oninput();
      const r = { opened, m: $('#svModel').value, v: $('#svVariant').value, c: $('#svColor').value,
        unit: $('#sUnit').value, wantId: u.id, wm: u.model, wv: u.variant, wc: u.color,
        closed: document.getElementById('svQSug').style.display === 'none' };
      q.value = ''; ['svModel', 'svVariant', 'svColor'].forEach(k => $('#' + k).value = ''); rSell();
      return r;
    });
    if (!g4.opened) bad('[4] แผงไม่เปิดก่อนเริ่มเคส — focus ไม่ทำงาน');
    if (g4.m !== g4.wm || g4.v !== g4.wv || g4.c !== g4.wc)
      bad('[4] พิมพ์เลขถังแล้ว back-fill ไม่ทำงาน (ได้ ' + g4.m + '/' + g4.v + '/' + g4.c + ')');
    if (g4.unit !== g4.wantId) bad('[4] พิมพ์เลขถังแล้ว #sUnit ไม่ชี้คันนั้น');
    if (!g4.closed) bad('[4] back-fill เจอคันแล้วแผงยังเปิดค้าง');

    /* ---------- [5] blur → แผงปิดเอง ---------- */
    await p.click('#svQ'); await p.waitForTimeout(150);
    const open5 = await p.evaluate(() => document.getElementById('svQSug').style.display !== 'none');
    if (!open5) bad('[5] แผงไม่เปิดก่อนเริ่มเคส blur');
    await p.evaluate(() => document.getElementById('svQ').blur());
    await p.waitForTimeout(300);
    const g5 = await p.evaluate(() => document.getElementById('svQSug').style.display === 'none');
    if (!g5) bad('[5] blur แล้วแผงไม่ปิด');

    /* ---------- [8] v1.40.1 · พิมพ์เลขที่แมตช์หลายคัน → แถวคันขึ้นในแผง แตะแล้วเลือกได้ ---------- */
    await p.click('#svQ'); await p.waitForTimeout(150);
    const g8 = await p.evaluate(() => {
      const pool = sellPool();
      let frag = null, hits = [];                    /* หา fragment ≥3 ตัวที่แมตช์ ≥2 คันจากข้อมูลจริง */
      outer: for (const u of pool) {
        for (const len of [3, 4, 5]) {
          const s = u.frame.slice(0, len).toLowerCase();
          const h = pool.filter(x => (x.engine + ' ' + x.frame + ' ' + x.variant).toLowerCase().indexOf(s) >= 0);
          if (h.length >= 2) { frag = s; hits = h; break outer; }
        }
      }
      if (!frag) return { skip: true };
      const q = $('#svQ'); q.value = frag.toUpperCase(); q.oninput();
      const box = document.getElementById('svQSug');
      const rows = [...box.querySelectorAll('.si[data-u]')];
      const before = { open: box.style.display !== 'none', n: rows.length, want: hits.length,
        modelSel: $('#svModel').value, variantSel: $('#svVariant').value };
      let after = null;
      if (rows.length) {
        const id = rows[0].dataset.u;
        const u = pool.find(x => x.id === id);
        rows[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        after = { id, m: $('#svModel').value, v: $('#svVariant').value, c: $('#svColor').value,
          unit: $('#sUnit').value, wm: u.model, wv: u.variant, wc: u.color,
          closed: box.style.display === 'none', q: $('#svQ').value };
      }
      $('#svQ').value = ''; ['svModel', 'svVariant', 'svColor'].forEach(k => $('#' + k).value = ''); rSell();
      return { skip: false, frag, before, after };
    });
    if (g8.skip) bad('[8] หา fragment ที่แมตช์หลายคันไม่ได้จาก seed — เคสทดสอบไม่ทำงาน');
    else {
      if (!g8.before.open || !g8.before.n)
        bad('[8] พิมพ์ "' + g8.frag + '" (แมตช์ ' + g8.before.want + ' คัน) แล้วแผงไม่โชว์แถวคัน — ข้อมูลไม่ขึ้น');
      else {
        if (g8.before.n !== g8.before.want)
          bad('[8] พิมพ์ "' + g8.frag + '" ได้แถวคัน ' + g8.before.n + ' แถว ควรเป็น ' + g8.before.want);
        if (g8.before.modelSel || g8.before.variantSel)
          bad('[8] แมตช์หลายคันแต่ select โดนเติม (' + g8.before.modelSel + '/' + g8.before.variantSel + ') — ห้ามเดาหยิบคันแรก');
        if (g8.after.m !== g8.after.wm || g8.after.v !== g8.after.wv || g8.after.c !== g8.after.wc)
          bad('[8] แตะแถวคันแล้วตัวกรองไม่ตั้งตามคัน (ได้ ' + g8.after.m + '/' + g8.after.v + '/' + g8.after.c + ')');
        if (g8.after.unit !== g8.after.id) bad('[8] แตะแถวคันแล้ว #sUnit ไม่ชี้คันนั้น');
        if (!g8.after.closed) bad('[8] แตะแถวคันแล้วแผงไม่ปิด');
        if (g8.after.q !== '') bad('[8] แตะแถวคันแล้ว #svQ ไม่ถูกล้าง');
      }
    }
  }

  /* ---------- [6] หน้าจองได้แผงเดียวกันจากโค้ดกลาง ---------- */
  await p.evaluate(() => go('booking')); await p.waitForTimeout(250);
  const has6 = await p.evaluate(() => !!document.getElementById('bkQSug'));
  if (!has6) bad('[6] ไม่มีแผง #bkQSug ในหน้าจอง');
  else {
    await p.click('#bkQ'); await p.waitForTimeout(150);
    const g6 = await p.evaluate(() => {
      const box = document.getElementById('bkQSug');
      const rows = [...box.querySelectorAll('.si')];
      const want = [...new Set(bookPool().map(u => u.model))].sort((a, b2) => a.localeCompare(b2, 'th'));
      const open = box.style.display !== 'none';
      if (!open || !rows.length) return { open, got: '', want: want.join(',') };
      const pick = rows[0].querySelector('b').textContent;
      rows[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      const opts = [...document.querySelectorAll('#bkUnit option')].map(o => o.value).filter(Boolean);
      const bad2 = bookPool().filter(u => opts.indexOf(u.id) >= 0 && u.model !== pick).length;
      const r = { open, got: rows.map(x => x.querySelector('b').textContent).join(','), want: want.join(','),
        pick, model: $('#bkModel').value, offModel: bad2,
        closed: box.style.display === 'none' };
      ['bkQ', 'bkModel', 'bkVariant', 'bkColor'].forEach(k => { const el = $('#' + k); if (el) el.value = ''; });
      rBooking();
      return r;
    });
    if (!g6.open) bad('[6] คลิก #bkQ แล้วแผงไม่เปิด');
    else {
      if (g6.got !== g6.want) bad('[6] รายชื่อในแผงหน้าจองไม่ตรง bookPool ได้ [' + g6.got + '] ควร [' + g6.want + ']');
      if (g6.model !== g6.pick) bad('[6] เลือกรุ่นในหน้าจองแล้ว #bkModel เป็น "' + g6.model + '"');
      if (g6.offModel) bad('[6] เลือกรุ่นแล้ว #bkUnit ยังมีคันรุ่นอื่น ' + g6.offModel + ' คัน');
      if (!g6.closed) bad('[6] เลือกรุ่นในหน้าจองแล้วแผงไม่ปิด');
    }
  }

  await b.close();
  if (errors.length) fails.push(...errors);
  if (fails.length) { console.log('FAILS:'); fails.forEach(f => console.log(f)); process.exit(1); }
  console.log('ALL_CHECKS_PASS (modelsug-r40: 9 ข้อ)');
})().catch(e => { console.error('SUITE_CRASH', e); process.exit(2); });
