/* ด่านกลุ่ม ① (บรีฟรอบ 1 · I1-I6 + §9k) — หน้าตาต่อคน
   ธีม/ขนาดอักษร/ฟอนต์เปลี่ยนผ่าน token จริง · เอกสารล็อกกระดาษขาวทุกธีม ·
   ตั้งค่าเก็บต่อผู้ใช้ (คนอื่นไม่เปลี่ยนตาม) · เมนู 6 กลุ่มสี · ขั้นตอนสีเขียว · 390px ไม่เลื่อนข้างในธีมมืด */
const { chromium, EXE, BASE } = require('./env');

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errors = [];
  const bad = m => fails.push(m);
  const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  const login = async (pg, id) => { await pg.goto(BASE + '/index.html');
    await pg.click('#lgUsers [data-id="' + id + '"]'); await pg.click('#lgGo'); await pg.waitForTimeout(400); };
  await login(p, 'ST1');

  /* 1 · หน้า "ปรับแต่ง" เปิดได้ทุกบทบาทตามค่าเริ่มต้นของตารางสิทธิ์ */
  const t1 = await p.evaluate(() => {
    const P = permDefaults();
    return Object.keys(ROLES).filter(r => P[r]['page:custom'] !== 'write');
  });
  if (t1.length) bad('บทบาทยังเข้าหน้าปรับแต่งไม่ได้: ' + t1.join(', '));

  /* 2 · สลับธีมมืด → token เปลี่ยนจริงทั้งพื้นและหมึก + จำไว้ใน localStorage ของคนนี้ */
  const t2 = await p.evaluate(() => {
    go('custom');
    const bg0 = getComputedStyle(document.body).backgroundColor;
    document.querySelector('#cuTheme [data-cut="dark"]').onclick();
    const de = document.documentElement;
    const bg1 = getComputedStyle(document.body).backgroundColor;
    return { attr: de.dataset.theme === 'dark', changed: bg0 !== bg1,
      saved: (JSON.parse(localStorage.getItem('famai_ui_' + ME.id) || '{}')).theme === 'dark',
      ink: getComputedStyle(de).getPropertyValue('--ink').trim() };
  });
  if (!t2.attr)    bad('กดธีมมืดแล้ว data-theme ไม่ถูกตั้ง');
  if (!t2.changed) bad('ธีมมืดไม่เปลี่ยนสีพื้นจริง');
  if (!t2.saved)   bad('ธีมไม่ถูกจำใน localStorage ต่อผู้ใช้');
  if (t2.ink !== '#ECEDF0') bad('token --ink ไม่สลับตามธีมมืด (ได้ ' + t2.ink + ')');

  /* 3 · เอกสารบนธีมมืดยังเป็นกระดาษขาว — สิ่งที่เห็นก่อนพิมพ์ต้องเป็นใบเดียวกับที่พิมพ์ */
  const t3 = await p.evaluate(() => {
    const s = SALES.find(x => !x.void);
    DOC_SALE = s.id;
    const div = document.createElement('div');
    div.innerHTML = docHTML('TAXINV', docData());
    document.body.appendChild(div);
    const doc = div.querySelector('.doc');
    const st = getComputedStyle(doc);
    const out = { bg: st.backgroundColor, ink: st.color };
    div.remove();
    return out;
  });
  if (t3.bg !== 'rgb(255, 255, 255)') bad('ธีมมืดย้อมพื้นเอกสาร: ' + t3.bg);
  if (t3.ink !== 'rgb(22, 24, 29)')   bad('ธีมมืดย้อมหมึกเอกสาร: ' + t3.ink);

  /* 4 · ขนาดอักษร 3 ระดับ — token --t-body ขยับจริง */
  const t4 = await p.evaluate(() => {
    const read = () => parseFloat(getComputedStyle(document.body).fontSize);
    const std = read();
    document.querySelector('#cuFs [data-cuf="xl"]').onclick();
    const xl = read();
    document.querySelector('#cuFs [data-cuf="std"]').onclick();
    return { std, xl, back: read() === std };
  });
  if (!(t4.xl > t4.std)) bad('ขนาด "ใหญ่มาก" ไม่ทำให้ตัวอักษรใหญ่ขึ้น (' + t4.std + '→' + t4.xl + ')');
  if (!t4.back)          bad('กลับขนาดมาตรฐานแล้วตัวอักษรไม่กลับ');

  /* 5 · ฟอนต์: เลือกแล้ว --f-thai สลับ + มี <link> Google Fonts · กลับค่าเริ่มต้นแล้ว link หาย */
  const t5 = await p.evaluate(() => {
    $('#cuFont').value = 'Sarabun'; $('#cuFont').onchange();
    const de = document.documentElement;
    const set = de.style.getPropertyValue('--f-thai').includes('Sarabun')
      && !!document.querySelector('#uiFontLink')
      && document.querySelector('#uiFontLink').href.includes('Sarabun');
    $('#cuFont').value = 'Noto Sans Thai'; $('#cuFont').onchange();
    const cleared = !de.style.getPropertyValue('--f-thai') && !document.querySelector('#uiFontLink');
    return { set, cleared, n: UI_FONTS.length };
  });
  if (!t5.set)     bad('เลือกฟอนต์แล้ว --f-thai/link ไม่ถูกตั้ง');
  if (!t5.cleared) bad('กลับฟอนต์เริ่มต้นแล้ว override ไม่ถูกล้าง');
  if (t5.n !== 20) bad('แคตตาล็อกฟอนต์มี ' + t5.n + ' ตัว ควรเป็น 20 (I5)');

  /* 6 · เมนู 6 กลุ่มสี — ปุ่ม nav มีคลาส g1..g6 ครบทุกกลุ่ม และ token กลุ่มมีจริง */
  const t6 = await p.evaluate(() => {
    buildNav();
    const gs = new Set([...document.querySelectorAll('#nav .nb')]
      .map(bn => [...bn.classList].find(c => /^g[1-6]$/.test(c))).filter(Boolean));
    const tok = getComputedStyle(document.documentElement).getPropertyValue('--grp3').trim();
    return { n: gs.size, tok };
  });
  if (t6.n !== 6) bad('ปุ่มเมนูมีกลุ่มสี ' + t6.n + ' กลุ่ม ควรครบ 6 (I1)');
  if (!t6.tok)    bad('token สีกลุ่ม (--grp3) ไม่มีจริง');

  /* 7 · แถบขั้นตอนเป็นสีเขียว — ขั้นปัจจุบันต้องใช้ --pos ไม่ใช่แดง (I1) */
  const t7 = await p.evaluate(() => {
    document.querySelector('#cuTheme [data-cut="std"]').onclick();   /* วัดบนธีมมาตรฐาน */
    const div = document.createElement('div');
    div.innerHTML = steps(['ก', 'ข', 'ค'], 1);
    document.body.appendChild(div);
    const now = div.querySelector('.pn.now'), done = div.querySelector('.pn.done');
    const c = { now: getComputedStyle(now).backgroundColor, done: getComputedStyle(done).backgroundColor };
    div.remove();
    return c;
  });
  if (t7.now  !== 'rgb(31, 122, 77)') bad('ขั้นปัจจุบันไม่ใช่สีเขียว --pos: ' + t7.now);
  if (t7.done !== 'rgb(31, 122, 77)') bad('ขั้นที่ผ่านไม่ใช่สีเขียว --pos: ' + t7.done);

  /* 8 · ตั้งค่าติดคนไม่ติดเครื่องรวม: รีโหลด = คนเดิมยังมืด · ผู้ใช้อื่นบนเครื่องเดียวกัน = ค่าเริ่มต้น */
  await p.evaluate(() => { document.querySelector('#cuTheme [data-cut="dark"]').onclick(); });
  await login(p, 'ST1');
  const t8a = await p.evaluate(() => document.documentElement.dataset.theme === 'dark');
  if (!t8a) bad('รีโหลดแล้วธีมของคนเดิมหาย (I6)');
  await login(p, 'ST3');                                   /* เครื่องเดียวกัน (context เดิม) คนละคน */
  const t8b = await p.evaluate(() => !document.documentElement.dataset.theme);
  if (!t8b) bad('ธีมของคนหนึ่งรั่วไปหาผู้ใช้อีกคนบนเครื่องเดียวกัน');

  /* 9 · ธีมมืดที่ 390px — หน้าหลักยังไม่มีเลื่อนซ้าย-ขวา (กติกาเดิมต้องรอดทุกธีม) */
  const p2 = await ctx.newPage();
  p2.on('pageerror', e => errors.push('M PAGEERROR ' + e.message));
  await p2.setViewportSize({ width: 390, height: 844 });
  await login(p2, 'ST1');                                  /* ST1 ตั้งธีมมืดค้างไว้จากข้อ 8 */
  for (const k of ['dash', 'sell', 'hr', 'custom']) {
    const w = await p2.evaluate(kk => { if (canSee(kk)) go(kk);
      return Math.max(document.body.scrollWidth, document.documentElement.scrollWidth); }, k);
    if (w > 390) bad('ธีมมืด ' + k + ': กว้าง ' + w + ' > 390');
    await p2.waitForTimeout(120);
  }
  await p2.close();

  console.log(fails.length ? 'FAILS:\n' + [...new Set(fails)].join('\n') : 'ALL_CHECKS_PASS');
  console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})();
