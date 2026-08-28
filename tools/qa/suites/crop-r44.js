/* ด่าน v1.44 — รูปรถ 1:1 ทุกจุด + ตัวครอปตอนอัปโหลด
   คำสั่งเจ้าของ 28 ส.ค. 2569: "ทุกส่วนที่มีรูปรถ แสดงผลเป็นรูปขนาด 1:1 และเมื่ออัปโหลดรูป
   จะให้สามารถ crop รูปได้ รูปแบบของส่วน crop ทำให้ดูเป็นสากลและเหมาะสำหรับ mobile ด้วย"
   ล็อก:
   [1] ทุกกรอบรูปรถที่มองเห็น (.bph และ .gcard .ph) เป็นจัตุรัส |w/h-1| < .02
   [2] เลือกไฟล์ในแผ่นแก้รุ่น → #crop เปิด · ไม่ล้นข้างที่ 390 · แผ่นแก้รุ่นข้างใต้ยังอยู่
   [3] เวทีครอปเป็นจัตุรัสและกว้างพอใช้งานบนมือถือ (≥240px ที่ 390)
   [4] ลากไกลเกินภาพแล้วกรอบยังอยู่ในภาพ (หนีบขอบ)
   [5] สไลเดอร์ซูม 200% → หน้าต่างครอบเหลือครึ่งเดียว
   [6] บีบสองนิ้ว → ซูมเพิ่มจริง
   [7] กดใช้รูปนี้ → ได้ไฟล์ jpeg ที่กว้าง=สูง
   [8] สิ่งที่เห็น=สิ่งที่ได้: ไม่ขยับ→ครอปกลาง · ลากไปขวา→ได้ฝั่งขวาจริง (ไม่ใช่แค่พรีวิวขยับ)
   [9] ยกเลิก → ไม่แตะข้อมูลรุ่น และช่องเลือกไฟล์ถูกล้าง (เลือกไฟล์เดิมซ้ำได้)
   [10] เปิดตัวครอปแล้ว body ถูกล็อกไม่ให้เลื่อนพื้นหลัง
   [11] ลากด้วย "นิ้วจริง" (CDP Input.dispatchTouchEvent เข้าท่อ gesture ของเบราว์เซอร์ ไม่ใช่
        dispatchEvent ตรง ๆ) แล้วรูปต้องขยับเต็มระยะ — ข้อนี้คือข้อเดียวที่จับ touch-action:none หายได้
        ถอด touch-action ออกแล้วเบราว์เซอร์กินท่าลากไปเลื่อนหน้า รูปขยับเหลือไม่ถึง 1 ใน 5 */
const { chromium, EXE, BASE } = require('./env');

/* PNG 1x1 — เล็กที่สุดที่ imgPrepare ยังทำงานได้ */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errors = [];
  const bad = m => fails.push(m);

  for (const W of [1440, 390]) {
    const tag = W + 'px';
    const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: W, height: 900 } });
    ctx.setDefaultTimeout(8000);
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(tag + ' PAGEERROR ' + e.message));
    /* ห่อทั้งจอไว้ — ของที่พังกลางคันต้องยังพิมพ์ข้อที่จับได้ก่อนหน้าออกมาให้ครบ
       ไม่งั้นเวลาพิสูจน์ mutation จะเห็นแค่ "ชุดล่ม" แล้วเดาไม่ออกว่าแดงเพราะข้อไหน */
    try {
    await p.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await p.click('#lgGo'); await p.waitForTimeout(450);

    /* ---------- [1] กรอบรูปรถทุกจุดเป็นจัตุรัส ---------- */
    const seen = [];
    const scan = async where => {
      const r = await p.evaluate(() => [...document.querySelectorAll('.bph, .gcard .ph')]
        .filter(el => el.offsetParent !== null && el.offsetWidth > 4)
        .map(el => ({ w: el.offsetWidth, h: el.offsetHeight,
          cls: el.className, id: (el.closest('[id]') || {}).id || '' })));
      r.forEach(x => seen.push(Object.assign({ where }, x)));
    };
    await p.evaluate(() => { go('stock'); stTab('grp'); }); await p.waitForTimeout(300); await scan('stock/grp');
    await p.evaluate(() => stTab('gal')); await p.waitForTimeout(300); await scan('stock/gal');
    await p.evaluate(() => { go('sell'); const u = sellPool()[0]; if (u) sUnitSet(u.id); });
    await p.waitForTimeout(300); await scan('sell');
    await p.evaluate(() => { go('deal'); const s = SALES.find(x => !x.void); if (s) { DEAL_SEL = s.custId; rDeal(); } });
    await p.waitForTimeout(300); await scan('deal/one');
    await p.evaluate(() => go('settings', '#cfTabs [data-p="cf2"]')); await p.waitForTimeout(300); await scan('settings/cf2');
    await p.evaluate(() => modelModal('BJKD00')); await p.waitForTimeout(300); await scan('modelModal');
    await p.evaluate(() => closeModal()); await p.waitForTimeout(200);

    if (seen.length < 4) bad(tag + ': หากรอบรูปรถได้แค่ ' + seen.length + ' จุด — เดินหน้าไม่ครบ');
    const notSq = seen.filter(x => Math.abs(x.w / x.h - 1) >= 0.02);
    if (notSq.length)
      bad(tag + ': กรอบรูปรถไม่เป็นจัตุรัส ' + notSq.length + ' จุด เช่น ' +
        notSq.slice(0, 3).map(x => x.where + ' ' + x.w + '×' + x.h).join(' · '));

    /* ---------- [2][3] เปิดตัวครอปจากแผ่นแก้รุ่น ---------- */
    await p.evaluate(() => { closeModal(); modelModal('BTF200'); }); await p.waitForTimeout(300);
    const [chooser] = await Promise.all([
      p.waitForEvent('filechooser'),
      p.click('#vmColorList [data-vcp="0"]')
    ]);
    await chooser.setFiles({ name: 'c0.png', mimeType: 'image/png', buffer: PNG });
    const opened = await p.waitForSelector('#crop.on', { timeout: 5000 }).then(() => true).catch(() => false);
    if (!opened) bad(tag + ': เลือกไฟล์แล้วตัวครอปไม่เปิด');
    else {
      const g2 = await p.evaluate(() => {
        const box = document.querySelector('#crop .cbox'), st = document.getElementById('crSt');
        return { overflow: box.scrollWidth - box.clientWidth,
          body: document.body.scrollWidth - innerWidth,
          rows: document.querySelectorAll('#vmColorList .vmrow').length,
          w: st.offsetWidth, h: st.offsetHeight,
          lock: document.body.classList.contains('lock') };
      });
      if (g2.overflow > 1) bad(tag + ': กล่องครอปล้นข้าง ' + g2.overflow + 'px');
      if (g2.body > 1) bad(tag + ': เปิดตัวครอปแล้วหน้าเลื่อนซ้าย-ขวาได้ ' + g2.body + 'px');
      if (!g2.rows) bad(tag + ': เปิดตัวครอปแล้วการ์ดสีในแผ่นแก้รุ่นหายไป — ใช้โฮสต์เดียวกับ modal อยู่');
      if (Math.abs(g2.w / g2.h - 1) >= 0.02) bad(tag + ': เวทีครอปไม่เป็นจัตุรัส (' + g2.w + '×' + g2.h + ')');
      if (W === 390 && g2.w < 240) bad(tag + ': เวทีครอปกว้างแค่ ' + g2.w + 'px — เล็กเกินไปบนมือถือ');
      /* ---------- [10] ---------- */
      if (!g2.lock) bad(tag + ': เปิดตัวครอปแล้วพื้นหลังยังเลื่อนได้ (ไม่มี body.lock)');

      /* ---------- [4] หนีบขอบ ---------- */
      const st = await p.$('#crSt'); const bb = await st.boundingBox();
      await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await p.mouse.down();
      await p.mouse.move(bb.x + bb.width / 2 + 5000, bb.y + bb.height / 2 + 5000, { steps: 3 });
      await p.mouse.up();
      const g4 = await p.evaluate(() => { const r = cropRect();
        return { ok: r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= r.iw + 0.5 && r.y + r.w <= r.ih + 0.5,
          r: [r.x, r.y, r.w, r.iw, r.ih] }; });
      if (!g4.ok) bad(tag + ': ลากเกินขอบแล้วกรอบหลุดออกนอกรูป [' + g4.r.join(',') + ']');

      /* ---------- [5] สไลเดอร์ ---------- */
      const g5 = await p.evaluate(() => {
        const z = document.getElementById('crZ');
        z.value = 100; z.oninput(); const w1 = cropRect().w;
        z.value = 200; z.oninput(); const w2 = cropRect().w;
        z.value = 100; z.oninput();
        return { w1, w2 };
      });
      if (Math.abs(g5.w2 - g5.w1 / 2) > Math.max(1, g5.w1 * 0.02))
        bad(tag + ': ซูม 200% แล้วหน้าต่างครอบไม่เหลือครึ่ง (' + g5.w1 + ' → ' + g5.w2 + ')');

      /* ---------- [6] บีบสองนิ้ว ---------- */
      const g6 = await p.evaluate(() => {
        const el = document.getElementById('crSt'), r = el.getBoundingClientRect();
        const ev = (t, id, x, y) => el.dispatchEvent(new PointerEvent(t,
          { pointerId: id, clientX: r.left + x, clientY: r.top + y, bubbles: true }));
        const z0 = CROP.z;
        ev('pointerdown', 1, r.width * 0.4, r.height * 0.5);
        ev('pointerdown', 2, r.width * 0.6, r.height * 0.5);
        ev('pointermove', 1, r.width * 0.2, r.height * 0.5);
        ev('pointermove', 2, r.width * 0.8, r.height * 0.5);
        const z1 = CROP.z;
        ev('pointerup', 1, r.width * 0.2, r.height * 0.5);
        ev('pointerup', 2, r.width * 0.8, r.height * 0.5);
        return { z0, z1 };
      });
      if (!(g6.z1 >= g6.z0 * 1.6)) bad(tag + ': บีบสองนิ้วแล้วไม่ซูม (' + g6.z0 + ' → ' + g6.z1 + ')');

      /* ---------- [7] ได้ไฟล์จัตุรัส ---------- */
      await p.click('#crGo');
      await p.waitForTimeout(900);
      const g7 = await p.evaluate(() => {
        const r = [...document.querySelectorAll('#vmColorList .vmrow')][0];
        return { img: !!(r && r.querySelector('.bph img')), open: document.getElementById('crop').classList.contains('on') };
      });
      if (!g7.img) bad(tag + ': กดใช้รูปนี้แล้วรูปไม่ขึ้นในการ์ดสี');
      if (g7.open) bad(tag + ': กดใช้รูปนี้แล้วตัวครอปไม่ปิด');
      const g7b = await p.evaluate(() => document.getElementById('vmImg').value);
      if (g7b !== '') bad(tag + ': ช่องเลือกไฟล์ไม่ถูกล้าง — เลือกไฟล์เดิมซ้ำไม่ได้');
    }

    /* ---------- [8] สิ่งที่เห็น = สิ่งที่ได้ ---------- */
    const wys = await p.evaluate(async () => {
      if (typeof cropOpen !== 'function') return { err: 'ไม่มีฟังก์ชัน cropOpen' };
      /* ภาพ 1000×200 น้ำเงิน ยกเว้นแดงที่ x 400-600 (แนวเดียวกับ photo-r14 ข้อ 3) */
      const mk = () => { const c = document.createElement('canvas'); c.width = 1000; c.height = 200;
        const g = c.getContext('2d'); g.fillStyle = '#0000ff'; g.fillRect(0, 0, 1000, 200);
        g.fillStyle = '#ff0000'; g.fillRect(400, 0, 200, 200); return c.toDataURL('image/png'); };
      const px = async (file, x) => { const u = URL.createObjectURL(file);
        const im = new Image(); await new Promise(r => { im.onload = r; im.src = u; });
        const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
        const g = c.getContext('2d'); g.drawImage(im, 0, 0);
        const d = g.getImageData(Math.round(x * im.width), Math.round(im.height / 2), 1, 1).data;
        URL.revokeObjectURL(u);
        return d[0] > 150 && d[2] < 100 ? 'red' : (d[2] > 150 && d[0] < 100 ? 'blue' : 'other'); };
      const f = await fetch(mk()).then(r => r.blob())
        .then(bl => new File([bl], 'wide.png', { type: 'image/png' }));
      /* ก. ไม่ขยับ → ครอปกลาง = แดง */
      const p1 = cropOpen(f, 'QA');
      await new Promise(r => setTimeout(r, 250));
      document.getElementById('crGo').click();
      const a = await p1;
      /* ข. ลากไปขวาสุด → ต้องได้ฝั่งขวา = น้ำเงิน */
      const p2 = cropOpen(f, 'QA');
      await new Promise(r => setTimeout(r, 250));
      const el = document.getElementById('crSt'), r2 = el.getBoundingClientRect();
      const ev = (t, x) => el.dispatchEvent(new PointerEvent(t,
        { pointerId: 9, clientX: r2.left + x, clientY: r2.top + r2.height / 2, bubbles: true }));
      ev('pointerdown', r2.width * 0.8); ev('pointermove', -4000); ev('pointerup', -4000);
      document.getElementById('crGo').click();
      const bfile = await p2;
      return { aType: a && a.type, aSq: a ? null : 'no-file',
        mid: a ? await px(a, 0.5) : '-', left: a ? await px(a, 0.04) : '-',
        right: bfile ? await px(bfile, 0.5) : '-' };
    });
    if (wys.err) bad(tag + ': [8] ' + wys.err);
    else if (wys.aType !== 'image/jpeg') bad(tag + ': ไฟล์ที่ครอปไม่ใช่ jpeg (' + wys.aType + ')');
    else if (wys.left !== 'red') bad(tag + ': ไม่ขยับแล้วไม่ได้ครอปกลาง — ขอบซ้ายควรแดง ได้ ' + wys.left);
    if (!wys.err && wys.right !== 'blue') bad(tag + ': ลากไปฝั่งขวาแล้วไฟล์ไม่เปลี่ยนตาม — ควรน้ำเงิน ได้ ' + wys.right);

    /* ---------- [9] ยกเลิกไม่แตะข้อมูล ----------
       ปิดแผ่นแก้รุ่นก่อน เพราะแผ่นนั้นก็ล็อกจอเหมือนกัน — ถ้าไม่ปิด จะแยกไม่ออกว่า body.lock
       ที่เหลืออยู่มาจากตัวครอปที่ลืมปลด หรือมาจากแผ่นที่ยังเปิดอยู่ตามปกติ */
    await p.evaluate(() => closeModal()); await p.waitForTimeout(200);
    const g9 = await p.evaluate(async () => {
      if (typeof cropOpen !== 'function') return { err: 'ไม่มีฟังก์ชัน cropOpen' };
      const before = JSON.stringify(PRICE['BTF200'].c);
      const f = await fetch('data:image/png;base64,' +
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
        .then(r => r.blob()).then(bl => new File([bl], 'x.png', { type: 'image/png' }));
      const pr = cropOpen(f, 'QA');
      await new Promise(r => setTimeout(r, 200));
      /* ตอนนี้ไม่มีแผ่นอื่นเปิดอยู่ ล็อกที่เห็นจึงต้องมาจากตัวครอปเท่านั้น */
      const lockOpen = document.body.classList.contains('lock');
      document.getElementById('crX').click();
      const got = await pr;
      return { got, same: JSON.stringify(PRICE['BTF200'].c) === before, lockOpen,
        open: document.getElementById('crop').classList.contains('on'),
        lock: document.body.classList.contains('lock') };
    });
    if (g9.err) bad(tag + ': [9] ' + g9.err);
    else if (g9.got !== null) bad(tag + ': ยกเลิกครอปแล้วไม่ได้คืน null');
    else if (!g9.same) bad(tag + ': ยกเลิกครอปแล้วข้อมูลสีของรุ่นถูกแก้');
    if (!g9.err && !g9.lockOpen) bad(tag + ': เปิดตัวครอปเดี่ยว ๆ แล้วพื้นหลังยังเลื่อนได้ (syncLock ไม่รู้จัก #crop)');
    if (!g9.err && g9.open) bad(tag + ': กดปิดแล้วตัวครอปไม่ปิด');
    if (!g9.err && g9.lock) bad(tag + ': ปิดตัวครอปแล้ว body ยังถูกล็อก');

    } catch (e) { bad(tag + ': ชุดสะดุดกลางคัน — ' + e.message.split('\n')[0]); }
    await ctx.close();
  }

  /* ---------- [11] ลากด้วยนิ้วจริง ----------
     ต้องเป็นบริบทที่มีจอสัมผัสจริง (hasTouch) และยิงผ่าน CDP — PointerEvent ที่ dispatch ตรง
     ข้ามท่อ gesture ของเบราว์เซอร์ไปเลย จึงเขียวเสมอแม้ touch-action จะหาย */
  try {
    const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok',
      viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    ctx.setDefaultTimeout(8000);
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push('touch PAGEERROR ' + e.message));
    await p.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await p.click('#lgGo'); await p.waitForTimeout(450);
    await p.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 1000; c.height = 200;
      const g = c.getContext('2d'); g.fillStyle = '#00f'; g.fillRect(0, 0, 1000, 200);
      const f = await fetch(c.toDataURL('image/png')).then(r => r.blob())
        .then(bl => new File([bl], 'w.png', { type: 'image/png' }));
      window.__crop = cropOpen(f, 'นิ้วจริง');
    });
    await p.waitForSelector('#crop.on');
    await p.waitForTimeout(300);
    const bb = await (await p.$('#crSt')).boundingBox();
    const cd = await p.context().newCDPSession(p);
    const before = await p.evaluate(() => ({ cx: CROP.cx, sc: cropScale() }));
    const y = bb.y + bb.height / 2, x0 = bb.x + bb.width * 0.8, DRAG = 120;
    const pt = x => [{ x: x, y: y }];
    await cd.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x0) });
    for (let i = 1; i <= 6; i++)
      await cd.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x0 - i * DRAG / 6) });
    await cd.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(200);
    const after = await p.evaluate(() => CROP.cx);
    const moved = after - before.cx, want = DRAG / before.sc;
    if (moved < want * 0.6)
      bad('นิ้วจริง: ลาก ' + DRAG + 'px แล้วรูปขยับแค่ ' + moved.toFixed(1) +
        ' ควรได้ราว ' + want.toFixed(1) + ' — เบราว์เซอร์กินท่าลากไป (touch-action:none หาย?)');
    await p.evaluate(() => cropClose(null));
    await ctx.close();
  } catch (e) { bad('นิ้วจริง: ชุดสะดุด — ' + e.message.split('\n')[0]); }

  await b.close();
  if (errors.length) fails.push(...errors);
  if (fails.length) { console.log('FAILS:'); fails.forEach(f => console.log(f)); process.exit(1); }
  console.log('ALL_CHECKS_PASS (crop-r44: 10 ข้อ × 2 จอ + ลากด้วยนิ้วจริง)');
})().catch(e => { console.error('SUITE_CRASH', e); process.exit(2); });
