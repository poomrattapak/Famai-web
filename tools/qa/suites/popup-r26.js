/* ด่านของป๊อปอัพกลางจอ v1.26 ข้อ 2 — เจ้าของสั่ง "กลางจอ ให้ไปในแนวทางเดียวกันหมด"
   restyle ที่ CSS ของ #drw จุดเดียว: ทุก call site ของ openDrawer ได้กล่องกลางจอ+แอนิเมชันฟรี
   ห้ามรวม #drw กับ #modal — modal ต้องเปิดซ้อนบน drawer ได้ (review-r4 พึ่ง flow นี้)
   ทุกข้อพิสูจน์ mutation แล้ว */
const { chromium, EXE, BASE } = require('./env');

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errs = [];

  /* ---------- จอกว้าง 1280 ---------- */
  {
    const p = await (await b.newContext({ timezoneId: 'Asia/Bangkok',
      viewport: { width: 1280, height: 900 } })).newPage();
    p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
    await p.goto(BASE + '/index.html');
    await p.click('#lgGo'); await p.waitForTimeout(400);

    /* 1 · กล่องอยู่กลางจอจริงทั้งสองแกน */
    await p.evaluate(() => unitDrawer(UNITS[0].id)); await p.waitForTimeout(450);
    const c = await p.evaluate(() => {
      const r = document.querySelector('#drw').getBoundingClientRect();
      return { on: document.querySelector('#drw').classList.contains('on'),
        dx: Math.abs(r.left + r.width / 2 - innerWidth / 2),
        dy: Math.abs(r.top + r.height / 2 - innerHeight / 2) };
    });
    if (!c.on) fails.push('[1] unitDrawer ไม่เปิด');
    if (c.dx > 4) fails.push('[1] กล่องไม่อยู่กลางแนวนอน (เพี้ยน ' + c.dx.toFixed(1) + 'px) — ยังเป็นแผงข้างอยู่หรือเปล่า');
    if (c.dy > 4) fails.push('[1] กล่องไม่อยู่กลางแนวตั้ง (เพี้ยน ' + c.dy.toFixed(1) + 'px)');

    /* 3 · ต้องมีแอนิเมชันจริงทั้งคู่ โทนเดียวกัน */
    const anim = await p.evaluate(() => {
      const dur = getComputedStyle(document.querySelector('#drw')).transitionDuration;
      openModal('ทดสอบแอนิเมชัน', '<p>x</p>');
      const mb = getComputedStyle(document.querySelector('#modal .mbox'));
      return { drw: dur, name: mb.animationName, mdur: mb.animationDuration };
    });
    if (!/[1-9]/.test(anim.drw)) fails.push('[3] .drw ไม่มี transition (' + anim.drw + ') — เปิดแบบกระตุก');
    if (anim.name !== 'popin' || !/[1-9]/.test(anim.mdur))
      fails.push('[3] .mbox ไม่มีแอนิเมชัน popin (' + anim.name + '/' + anim.mdur + ')');

    /* 4 · modal เปิดซ้อนบน drawer ได้ และอยู่ชั้นบนกว่า — การซ้อนที่ review-r4 พึ่ง */
    const stack = await p.evaluate(() => ({
      drwOn: document.querySelector('#drw').classList.contains('on'),
      zd: +getComputedStyle(document.querySelector('#drw')).zIndex,
      zm: +getComputedStyle(document.querySelector('#modal')).zIndex }));
    if (!stack.drwOn) fails.push('[4] เปิด modal แล้ว drawer ปิดตัวเอง');
    if (!(stack.zm > stack.zd)) fails.push('[4] modal ไม่ได้อยู่ชั้นบนกว่า drawer (z ' + stack.zm + ' vs ' + stack.zd + ')');
    await p.evaluate(() => closeModal());

    /* 5 · ปิดแล้วเนื้อในต้องถูกล้าง (กัน id ค้างชนข้ามจอ) แต่เปิดใหม่เร็ว ๆ ต้องไม่โดนลบ */
    await p.evaluate(() => closeDrawer()); await p.waitForTimeout(450);
    const cleared = await p.evaluate(() => document.querySelector('#drwB').innerHTML === '');
    if (!cleared) fails.push('[5] ปิดแผ่นแล้ว #drwB ยังมีเนื้อหาเก่าค้าง');
    await p.evaluate(() => { openDrawer('x', '<b id="race26">x</b>'); closeDrawer();
      openDrawer('y', '<b id="race26b">y</b>'); });
    await p.waitForTimeout(450);
    const race = await p.evaluate(() => !!document.querySelector('#race26b'));
    if (!race) fails.push('[5] เปิดแผ่นใหม่ทันทีหลังปิด แล้วเนื้อหาใหม่โดนตัวล้างลบทิ้ง (race)');
    await p.context().close();
  }

  /* ---------- มือถือ 390 ---------- */
  {
    const p = await (await b.newContext({ timezoneId: 'Asia/Bangkok',
      viewport: { width: 390, height: 844 } })).newPage();
    p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
    await p.goto(BASE + '/index.html');
    await p.click('#lgGo'); await p.waitForTimeout(400);

    /* 2 · มือถือก็กลางจอ: กว้างเกือบเต็ม สูงไม่เกิน ~85dvh และไม่ทำจอเลื่อนข้าง */
    await p.evaluate(() => unitDrawer(UNITS[0].id)); await p.waitForTimeout(450);
    const m = await p.evaluate(() => {
      const r = document.querySelector('#drw').getBoundingClientRect();
      return { w: r.width, h: r.height, top: r.top,
        vc: Math.abs(r.top - (innerHeight - r.height) / 2),
        sw: document.documentElement.scrollWidth };
    });
    if (!(m.w >= 390 - 24 && m.w <= 390)) fails.push('[2] ความกว้างที่ 390 ผิดทรง: ' + m.w.toFixed(0) + 'px');
    if (m.h > 844 * 0.86) fails.push('[2] สูงเกิน 85dvh: ' + m.h.toFixed(0) + 'px');
    if (m.vc > 8) fails.push('[2] ไม่อยู่กลางแนวตั้ง (เพี้ยน ' + m.vc.toFixed(1) + 'px) — ยังเป็นแผ่นล่างอยู่หรือเปล่า');
    if (m.sw > 390) fails.push('[2] เปิดกล่องแล้วจอเลื่อนซ้าย-ขวาได้ (' + m.sw + 'px)');
    await p.evaluate(() => closeDrawer()); await p.waitForTimeout(400);

    /* 6 · เนื้อหาหนักสุดของ drawer — person sheet มีปฏิทินเดือน .calm ต้องไม่ล้นที่ 390
       คิวตรวจอยู่ใต้แท็บ #hrTabRv — ต้องกดแท็บก่อน (สูตรเดียวกับ review-r4) */
    await p.evaluate(() => go('hr')); await p.waitForTimeout(400);
    await p.click('#hrTabRv'); await p.waitForTimeout(400);
    const btn = await (async () => {
      const all = await p.$$('#rvTable [data-rv]');
      const me = await p.evaluate(() => ME.id);
      for (const el of all) {
        const k = await el.getAttribute('data-rv');
        if (k.split('|')[0] !== me) return el;
      }
      return null;
    })();
    if (!btn) fails.push('[6] ไม่พบปุ่มตรวจในคิว — เปิด person sheet ไม่ได้');
    else {
      await btn.click(); await p.waitForTimeout(500);
      const ps = await p.evaluate(() => ({
        on: document.querySelector('#drw').classList.contains('on'),
        cal: !!document.querySelector('.calm'),
        sw: document.documentElement.scrollWidth,
        w: document.querySelector('#drw').getBoundingClientRect().width }));
      if (!ps.on)        fails.push('[6] person sheet ไม่เปิด');
      if (!ps.cal)       fails.push('[6] person sheet ไม่มีปฏิทินเดือน');
      if (ps.sw > 390)   fails.push('[6] person sheet ทำจอเลื่อนข้างที่ 390 (' + ps.sw + 'px)');
      if (ps.w > 390)    fails.push('[6] person sheet กว้างเกินจอ (' + ps.w.toFixed(0) + 'px)');
    }
    await p.context().close();
  }

  console.log(fails.length ? 'FAILS:\n' + fails.join('\n') : 'ALL_CHECKS_PASS');
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})();
