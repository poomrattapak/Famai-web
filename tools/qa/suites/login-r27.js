/* ด่านของหน้า login v1.27 — เจ้าของสั่ง "ออกแบบใหม่ทั้งหน้า ไม่ต้องเอาโครงเดิม"
   หน้านี้ไม่มีด่านตรวจหน้าตา แต่มีด่านอีก 51 ชุดพึ่ง "สัญญา" ของมัน
   ชุดนี้จึงล็อกสัญญาไว้ตรง ๆ เพื่อให้รื้อดีไซน์ได้โดยไม่ทำทั้งกระดานแดง:
   1 รายชื่อครบ 10 คน + คนแรกถูกเลือกไว้     4 สลับโหมดข้อมูลจริงได้ และช่องกรอกอยู่ครบ
   2 ข้อความในการ์ดมีชื่อบทบาท (smoke-r2 ค้นคำ) 5 ออกจากระบบแล้วกลับมาที่หน้า login
   3 เลือกคนแล้วกดเข้าระบบได้เป็นคนนั้นจริง   6 390px ไม่ล้นจอ กดเลือกคนสุดท้ายได้ · 7 ไม่มี error ตอนบูต */
const { chromium, EXE, BASE } = require('./env');

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errs = [];

  const p = await (await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } })).newPage();
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await p.goto(BASE + '/index.html');
  await p.waitForTimeout(400);

  /* 1 · รายชื่อพนักงานครบทุกคนที่ระบบมี และคนแรกถูกเลือกไว้ให้แล้ว */
  const t1 = await p.evaluate(() => {
    const us = [...document.querySelectorAll('#lgUsers [data-id]')];
    return { n: us.length, staff: STAFF.length, ids: us.map(u => u.dataset.id),
      firstOn: us[0] ? us[0].classList.contains('on') : false,
      cls: us[0] ? us[0].className : '', onCount: us.filter(u => u.classList.contains('on')).length };
  });
  if (t1.n !== t1.staff) fails.push('[1] หน้า login โชว์ ' + t1.n + ' คน แต่ระบบมีพนักงาน ' + t1.staff + ' คน');
  for (const id of ['ST1','ST2','ST3','ST4','ST6','ST7','ST8','ST9','ST10'])
    if (t1.ids.indexOf(id) < 0) fails.push('[1] ไม่มีปุ่มของ ' + id + ' (ด่านชุดอื่นคลิกตรง ๆ)');
  if (!t1.firstOn)      fails.push('[1] คนแรกไม่ถูกเลือกไว้ — ด่านที่กด #lgGo เปล่า ๆ จะได้คนผิด');
  if (t1.onCount !== 1) fails.push('[1] มีคนถูกเลือกพร้อมกัน ' + t1.onCount + ' คน ควรเลือกได้ทีละคน');
  if (!/\blg-u\b/.test(t1.cls)) fails.push('[1] ปุ่มพนักงานไม่มีคลาส lg-u (smoke-r2 ค้นจากคลาสนี้)');

  /* 2 · ข้อความในการ์ดต้องมีชื่อบทบาท — smoke-r2 ค้นคนด้วยคำว่า "บัญชี" กับ "สต๊อก" */
  const t2 = await p.evaluate(() => {
    const txt = [...document.querySelectorAll('#lgUsers .lg-u')].map(u => u.textContent);
    return { acct: txt.some(t => t.includes('บัญชี')), stock: txt.some(t => t.includes('สต๊อก')),
      sample: txt[0] || '' };
  });
  if (!t2.acct)  fails.push('[2] ไม่มีการ์ดไหนมีคำว่า "บัญชี" — smoke-r2 หาคนการเงินไม่เจอ');
  if (!t2.stock) fails.push('[2] ไม่มีการ์ดไหนมีคำว่า "สต๊อก" — smoke-r2 หาคนสต๊อกไม่เจอ');
  if (t2.sample.replace(/\s/g, '').length < 6) fails.push('[2] การ์ดพนักงานแทบไม่มีข้อความ: "' + t2.sample + '"');

  /* 3 · เลือกคนอื่นแล้วกดเข้าระบบ ต้องได้เป็นคนนั้นจริง */
  await p.click('#lgUsers [data-id="ST3"]');
  await p.click('#lgGo'); await p.waitForTimeout(500);
  const t3 = await p.evaluate(() => ({ me: ME && ME.id, off: $('#login').classList.contains('off'),
    appOn: !$('#app').classList.contains('off'), screen: !!document.querySelector('.screen.on') }));
  if (t3.me !== 'ST3') fails.push('[3] เลือก ST3 แล้วเข้าระบบได้เป็น ' + t3.me);
  if (!t3.off)         fails.push('[3] เข้าระบบแล้วหน้า login ไม่ได้ซ่อนด้วยคลาส off');
  if (!t3.appOn)       fails.push('[3] เข้าระบบแล้วแอปไม่โผล่');
  if (!t3.screen)      fails.push('[3] เข้าระบบแล้วไม่มีหน้าไหนเปิดอยู่');

  /* 5 · ออกจากระบบแล้วต้องกลับมาที่หน้า login (privacy-r5 พึ่งข้อนี้) */
  await p.evaluate(() => doLogout()); await p.waitForTimeout(800);
  const t5 = await p.evaluate(() => { const l = document.querySelector('#login');
    return { has: !!l, off: l ? l.classList.contains('off') : true,
      users: document.querySelectorAll('#lgUsers [data-id]').length }; });
  if (!t5.has)    fails.push('[5] ออกจากระบบแล้วไม่มี #login');
  if (t5.off)     fails.push('[5] ออกจากระบบแล้ว #login ยังมีคลาส off (ถูกซ่อนอยู่)');
  if (!t5.users)  fails.push('[5] กลับมาหน้า login แล้วไม่มีรายชื่อพนักงาน');

  /* 4 · สลับไปโหมดข้อมูลจริงแล้วช่องกรอกต้องใช้งานได้ และสลับกลับได้ */
  await p.click('#lgSwap'); await p.waitForTimeout(250);
  const t4 = await p.evaluate(() => {
    const vis = s => { const e = document.querySelector(s); return !!e && !!e.offsetParent; };
    return { live: vis('#lgEmail') && vis('#lgPw2') && vis('#lgGo2'), demoGone: !vis('#lgUsers'),
      swapTxt: document.querySelector('#lgSwap').textContent.trim() };
  });
  if (!t4.live)     fails.push('[4] กดสลับแล้วช่องอีเมล/รหัสผ่าน/ปุ่มเข้าระบบของโหมดจริงไม่โผล่ครบ');
  if (!t4.demoGone) fails.push('[4] เข้าโหมดจริงแล้วรายชื่อพนักงานสาธิตยังโชว์อยู่');
  if (!t4.swapTxt)  fails.push('[4] ปุ่มสลับโหมดไม่มีข้อความ');
  await p.fill('#lgEmail', 'x@y.z'); await p.fill('#lgPw2', 'zzz');   /* ต้องพิมพ์ได้จริง */
  await p.click('#lgSwap'); await p.waitForTimeout(250);
  const t4b = await p.evaluate(() => !!document.querySelector('#lgUsers') && !!document.querySelector('#lgUsers').offsetParent);
  if (!t4b) fails.push('[4] สลับกลับโหมดสาธิตแล้วรายชื่อพนักงานไม่กลับมา');
  await p.context().close();

  /* 6 · มือถือ 390: ไม่ล้นจอ และกดเลือกคนสุดท้ายในรายชื่อได้จริง */
  const m = await (await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 390, height: 844 } })).newPage();
  m.on('pageerror', e => errs.push('PAGEERROR(390) ' + e.message));
  await m.goto(BASE + '/index.html'); await m.waitForTimeout(400);
  /* nohscroll สแกนแค่ใน #app · หน้า login ยังมี .lg-wrap{overflow:hidden} ที่ "กลืน" ของล้นไว้เงียบ ๆ
     scrollWidth จึงมองไม่เห็น — ต้องวัดขอบขวาจริงของทุกชิ้นเทียบความกว้างจอ */
  const sw = await m.evaluate(() => {
    const over = [...document.querySelectorAll('#login *')]
      .filter(e => e.getBoundingClientRect().right > innerWidth + 1)
      .map(e => (e.id || e.className || e.tagName) + '@' + Math.round(e.getBoundingClientRect().right));
    return { body: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth), over: over.slice(0, 3) };
  });
  if (sw.body > 390)   fails.push('[6] 390: หน้า login กว้าง ' + sw.body + 'px — เลื่อนซ้าย-ขวาได้');
  if (sw.over.length)  fails.push('[6] 390: ของในหน้า login ล้นขอบขวา — ' + sw.over.join(' · '));
  const last = await m.evaluate(() => { const us = [...document.querySelectorAll('#lgUsers [data-id]')];
    return us.length ? us[us.length - 1].dataset.id : null; });
  if (!last) fails.push('[6] 390: ไม่มีรายชื่อพนักงาน');
  else {
    await m.click('#lgUsers [data-id="' + last + '"]');
    const on = await m.evaluate(id => document.querySelector('#lgUsers [data-id="' + id + '"]').classList.contains('on'), last);
    if (!on) fails.push('[6] 390: กดเลือกคนสุดท้าย (' + last + ') แล้วไม่ถูกเลือก');
    await m.click('#lgGo'); await m.waitForTimeout(500);
    const me = await m.evaluate(() => ME && ME.id);
    if (me !== last) fails.push('[6] 390: เลือก ' + last + ' แล้วเข้าระบบได้เป็น ' + me);
  }
  await m.context().close();

  console.log(fails.length ? 'FAILS:\n' + fails.join('\n') : 'ALL_CHECKS_PASS');
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})();
