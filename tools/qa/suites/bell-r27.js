/* ด่านของแถวบนสุด v1.27.2 — เจ้าของ: "notification button อยากให้อยู่บน navbar
   อันนี้อยู่ข้างล่าง navbar แล้วดูเป็นติ่งห้อยลงมาแปลก ๆ"

   ต้นเหตุ: ที่ 390 .top ห่อบรรทัด แล้ว .sp (flex:1) กินแถวแรกจนหมด
   ปุ่มกระดิ่งเลยตกไปแถวสอง ลอยอยู่กลาง ๆ ห่างจากปุ่มค้นหาที่อยู่แถวบน

   กติกาที่ด่านนี้ล็อก:
   1 กระดิ่งอยู่แถวเดียวกับปุ่มค้นหาเสมอ ทุกขนาดจอ   3 ปุ่มช่วงเวลายังกดได้ แผ่นยังเปิด
   2 กระดิ่งชิดขวา ไม่ลอยกลางจอ                     4 390 ไม่ล้นจอ · 5 ไม่มี error */
const { chromium, EXE, BASE } = require('./env');

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errs = [];
  const login = async (pg) => { await pg.goto(BASE + '/index.html');
    await pg.click('#lgUsers [data-id="ST1"]'); await pg.click('#lgGo'); await pg.waitForTimeout(600); };

  for (const [w, h, tag] of [[1440, 900, 'จอคอม'], [390, 844, '390']]) {
    const p = await (await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: w, height: h } })).newPage();
    p.on('pageerror', e => errs.push('PAGEERROR(' + tag + ') ' + e.message));
    await login(p);

    const t = await p.evaluate(() => {
      const r = s => { const e = document.querySelector(s);
        if (!e || !e.offsetParent) return null;
        const b = e.getBoundingClientRect();
        return { top: Math.round(b.top), right: Math.round(b.right), left: Math.round(b.left) }; };
      /* ตัวค้นหาบนแถบบนมีสองหน้าตา: ช่องยาว (.srch) จอกว้าง · ปุ่มไอคอน (#gsBtn) มือถือ */
      const top = document.querySelector('.top'), cs = getComputedStyle(top);
      const inner = top.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      return { bell: r('#bellBtn'), srch: r('.srch') || r('#gsBtn'), np: r('#npBtn'), inner: Math.round(inner),
        npW: (() => { const e = document.querySelector('#npBtn');
          return e && e.offsetParent ? Math.round(e.getBoundingClientRect().width) : 0; })(),
        sw: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) };
    });

    /* 1 · กระดิ่งกับตัวค้นหาต้องอยู่บรรทัดเดียวกัน — ต่างกันได้ไม่เกินครึ่งความสูงปุ่ม */
    if (!t.bell)      fails.push('[1] ' + tag + ': ไม่เห็นปุ่มกระดิ่งบนแถบบน');
    else if (!t.srch) fails.push('[1] ' + tag + ': ไม่เห็นตัวค้นหาบนแถบบน');
    else if (Math.abs(t.bell.top - t.srch.top) > 22)
      fails.push('[1] ' + tag + ': กระดิ่งคนละบรรทัดกับตัวค้นหา (กระดิ่ง y=' + t.bell.top
        + ' · ค้นหา y=' + t.srch.top + ') — ห้อยหลุดจากแถบบน');

    /* 2 · กระดิ่งต้องชิดขวา ไม่ลอยอยู่กลางจอ */
    if (t.bell && t.bell.right < w * 0.75)
      fails.push('[2] ' + tag + ': กระดิ่งไม่ชิดขวา (ขอบขวาอยู่ที่ ' + t.bell.right + ' จาก ' + w + ')');

    if (w === 390) {
      /* 2b · ปุ่มช่วงเวลาที่ตกไปแถวสองต้องเต็มความกว้าง — ปุ่มเล็กลอยอยู่ลำพังก็คือติ่งอีกอันหนึ่ง
         (เป็นข้อที่คุม flex:0 0 100% โดยตรง ไม่งั้นกฎนั้นไม่มีด่านคุม) */
      if (t.npW && t.npW < t.inner * 0.9)
        fails.push('[2] 390: ปุ่มช่วงเวลาอยู่แถวสองแต่กว้างแค่ ' + t.npW + ' จาก ' + t.inner
          + 'px — ลอยเป็นติ่ง ควรเต็มแถว');
      /* 3 · ปุ่มช่วงเวลายังต้องอยู่และกดเปิดแผ่นได้ (ห้ามแก้แถวบนแล้วทำของเดิมพัง) */
      if (!t.np) fails.push('[3] 390: ปุ่มช่วงเวลา+สาขาหายจากแถบบน');
      else {
        await p.click('#npBtn'); await p.waitForTimeout(250);
        if (!await p.isVisible('#navPerBox [data-pr="7"]'))
          fails.push('[3] 390: กดปุ่มช่วงเวลาแล้วแผ่นไม่เปิด');
        await p.keyboard.press('Escape'); await p.waitForTimeout(200);
      }
      /* กระดิ่งต้องกดได้จริง ไม่ถูกอะไรทับ */
      await p.click('#bellBtn'); await p.waitForTimeout(400);
      if (!await p.isVisible('#drw .db')) fails.push('[3] 390: กดกระดิ่งแล้วแผงแจ้งเตือนไม่เปิด');
      await p.keyboard.press('Escape'); await p.waitForTimeout(250);
      /* 4 · ไม่ล้นจอ */
      if (t.sw > 390) fails.push('[4] 390: แถบบนทำให้จอเลื่อนซ้าย-ขวาได้ (' + t.sw + 'px)');
    }
    await p.context().close();
  }

  console.log(fails.length ? 'FAILS:\n' + fails.join('\n') : 'ALL_CHECKS_PASS');
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})();
