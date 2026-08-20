/* ด่านกันลูป — เจ้าของสั่งว่า "ให้ qa ทุกอย่างไม่ให้ error บัค หรือลูป"
   ลูปในแอปนี้เกิดได้ 2 แบบ
   1) วาดซ้ำไม่รู้จบ — ตัววาดหน้าไปเรียก refreshAll() ซึ่งเรียกตัววาดหน้าอีกที
   2) handler ทับซ้อน — วาดใหม่แล้วผูก onclick เพิ่มเรื่อย ๆ กดครั้งเดียวทำงานหลายรอบ
   ตรวจด้วยการนับจำนวนครั้งที่ render() ถูกเรียกต่อการคลิกหนึ่งครั้ง
   ครั้งแรกได้เท่าไหร่ รอบต่อ ๆ ไปต้องได้เท่าเดิม ถ้าโตขึ้นแปลว่า handler ซ้อน */
const { chromium, EXE, BASE } = require('./env');
const MAX_PER_CLICK = 2;

const INSTRUMENT = () => {
  window.__rc = 0; window.__err = [];
  const r = window.render;
  window.render = function () { window.__rc++;
    if (window.__rc > 400) throw new Error('render() ถูกเรียกเกิน 400 ครั้ง — วนลูปแน่นอน');
    return r.apply(this, arguments); };
  window.addEventListener('unhandledrejection', e => window.__err.push('UNHANDLED ' + (e.reason && e.reason.message || e.reason)));
  const ce = console.error;
  console.error = function () { window.__err.push('CONSOLE ' + Array.from(arguments).join(' ')); return ce.apply(this, arguments); };
};

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errors = [];
  const bad = m => fails.push(m);

  for (const W of [1440, 390]) {
    const tag = W + 'px';
    const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: W, height: 900 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(tag + ' PAGEERROR ' + e.message));
    await p.goto(BASE + '/index.html');
    await p.click('#lgGo'); await p.waitForTimeout(400);
    await p.evaluate(INSTRUMENT);

    const rc = () => p.evaluate(() => window.__rc);
    /* ถ้าเจอลูปจริง ตัวนับใน INSTRUMENT จะโยน error ออกมากลางคัน
       ต้องดักไว้แล้วรายงานเป็นผลตรวจ ไม่ใช่ปล่อยให้ชุดทดสอบตายทั้งไฟล์ */
    const guard = async (what, fn) => {
      try { return await fn(); }
      catch (e) { bad(tag + ': ' + what + ' — ' + String(e.message || e).split('\n')[0]); return null; }
    };
    /* กดปุ่มหนึ่งครั้งแล้วคืนจำนวนครั้งที่ render() ถูกเรียก */
    const clicks = async (sel) => {
      const before = await rc();
      const ok = await guard('กด ' + sel, async () => { await p.click(sel); await p.waitForTimeout(220); return 1; });
      if (ok === null) return 999;
      return (await guard('อ่านตัวนับหลังกด ' + sel, rc) ?? 999) - before;
    };

    /* ---------- 1 · เดินทุกหน้าในเมนู หน้าละครั้ง ---------- */
    const screens = await p.evaluate(() => MENU.filter(m => m.k && canSee(m.k)).map(m => m.k));
    for (const k of screens) {
      const before = await rc();
      const ok = await guard('เข้าหน้า "' + k + '"', async () => {
        await p.evaluate(kk => go(kk), k); await p.waitForTimeout(180); return 1; });
      if (ok === null) break;                      /* ลูปแล้ว หน้าถัดไปไม่ต้องเดินต่อ */
      const n = (await rc()) - before;
      if (n > MAX_PER_CLICK) bad(tag + ': เข้าหน้า "' + k + '" เรียก render() ' + n + ' ครั้ง (เกิน ' + MAX_PER_CLICK + ')');
    }

    /* ถ้าเจอลูปตั้งแต่การเดินเมนู ส่วนที่เหลือไม่ต้องเดินต่อ — หน้าเดิมพังอยู่แล้ว */
    try {
    /* ---------- 2 · หน้าดีล: กดปุ่มเดิมซ้ำ 3 รอบ ตัวนับต้องไม่โต ---------- */
    await p.evaluate(() => go('deal')); await p.waitForTimeout(300);
    const rowN = await clicks('#dlTable [data-deal]');
    if (rowN > MAX_PER_CLICK) bad(tag + ': แตะแถวดีลเรียก render() ' + rowN + ' ครั้ง');

    /* ต้องเจาะจงเปิดดีลที่ "มีปุ่มนั้นจริง" ไม่ใช่แถวแรกที่บังเอิญขึ้นมา
       (แถวแรกคือดีลที่ตกราง ซึ่งไม่มีปุ่มเดินหน้า ถ้าใช้แถวแรกจะไม่ได้วัดอะไรเลย) */
    const pairs = [
      ['[data-dlfnext]', '[data-dlfback]', d => d.k === 'fin' && !d.off && d.fc],
      ['[data-dlrnext]', '[data-dlrback]', d => (d.k === 'deliver' || d.k === 'plate') && d.rg],
    ];
    for (const [fwd, back, pick] of pairs) {
      const cid = await p.evaluate(fn => { const d = dealAll().find(eval(fn)); return d ? d.c.id : null; }, pick.toString());
      if (!cid) { bad(tag + ': ไม่มีดีลใน seed ที่มีปุ่ม ' + fwd + ' ให้ทดสอบ'); continue; }
      await p.evaluate(id => { DEAL_SEL = id; rDeal(); }, cid);
      await p.waitForTimeout(250);
      const counts = [];
      for (let round = 0; round < 3; round++) {
        if (!await p.$('#dlOne ' + fwd)) break;
        counts.push(await clicks('#dlOne ' + fwd));
        if (!await p.$('#dlOne ' + back)) break;
        counts.push(await clicks('#dlOne ' + back));
      }
      if (!counts.length) bad(tag + ': เปิดดีลที่ควรมีปุ่ม ' + fwd + ' แล้วกดไม่ได้เลย');
      if (counts.length && Math.max(...counts) > MAX_PER_CLICK)
        bad(tag + ': ปุ่ม ' + fwd + ' เรียก render() สูงสุด ' + Math.max(...counts) + ' ครั้ง (' + counts.join(',') + ')');
      /* ตัวเลขต้องคงที่ทุกรอบ ถ้าโตขึ้นแปลว่ามี handler ซ้อนเพิ่มทุกครั้งที่วาดใหม่ */
      if (counts.length > 2 && counts[counts.length - 1] > counts[0])
        bad(tag + ': ปุ่ม ' + fwd + ' เรียก render() เพิ่มขึ้นเรื่อย ๆ (' + counts.join(',') + ') — handler ซ้อน');
    }
    await p.click('#dlBack'); await p.waitForTimeout(250);

    /* ---------- 3 · เข้า-ออกหน้าดีลซ้ำ 5 รอบ ---------- */
    const enter = [];
    for (let n = 0; n < 5; n++) {
      const before = await rc();
      await p.evaluate(() => go('dash')); await p.waitForTimeout(120);
      await p.evaluate(() => go('deal')); await p.waitForTimeout(160);
      enter.push((await rc()) - before);
    }
    if (enter[enter.length - 1] > enter[0])
      bad(tag + ': เข้า-ออกหน้าดีลแล้วจำนวน render() โตขึ้น (' + enter.join(',') + ')');

    /* ---------- 4 · แถบขั้นในหน้าติดตาม กดซ้ำไป-กลับ 3 รอบ ---------- */
    if (await p.evaluate(() => canSee('follow'))) {
      await p.evaluate(() => go('follow')); await p.waitForTimeout(250);
      const cid = await p.evaluate(() => { const c = CUSTOMERS.filter(x => inScope(x.branch))[0];
        c.stage = 'สนใจ'; rFollow(); return c.id; });
      await p.waitForTimeout(200);
      const cnts = [];
      for (let n = 0; n < 3; n++) {
        if (await p.$('#fwTable [data-fwst="' + cid + '|2"]')) cnts.push(await clicks('#fwTable [data-fwst="' + cid + '|2"]'));
        if (await p.$('#fwTable [data-fwst="' + cid + '|1"]')) cnts.push(await clicks('#fwTable [data-fwst="' + cid + '|1"]'));
      }
      if (cnts.length && Math.max(...cnts) > MAX_PER_CLICK)
        bad(tag + ': แถบขั้นในหน้าติดตามเรียก render() สูงสุด ' + Math.max(...cnts) + ' ครั้ง (' + cnts.join(',') + ')');
      if (cnts.length > 2 && cnts[cnts.length - 1] > cnts[0])
        bad(tag + ': แถบขั้นในหน้าติดตามมี handler ซ้อน (' + cnts.join(',') + ')');
    }

    } catch(e){ bad(tag + ': หยุดกลางคัน — ' + String(e.message||e).split('\n')[0]); }

    /* ---------- 5 · ไม่มี error สะสมตลอดทั้ง session ---------- */
    const jsErr = await guard('อ่าน error ที่สะสมไว้',
      () => p.evaluate(() => window.__err.filter(e => !/favicon|fonts\.g|gstatic|ERR_CONNECTION/.test(e)))) || [];
    jsErr.forEach(e => errors.push(tag + ' ' + e));
    const total = await guard('อ่านตัวนับรวม', rc);
    if (total !== null && total > 300) bad(tag + ': render() ถูกเรียกรวม ' + total + ' ครั้งตลอดการทดสอบ — สูงผิดปกติ');

    await ctx.close();
  }

  console.log(fails.length ? 'FAILS:\n' + [...new Set(fails)].join('\n') : 'NO_LOOPS_FOUND');
  console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})();
