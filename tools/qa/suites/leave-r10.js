/* ด่านของข้อ 6 — "เปิดวันลาให้เพื่อนร่วมงานเห็น แต่ไม่เปิดรายละเอียด"
   สิ่งที่ต้องเปิด: ชื่อคนลา · วันที่ลา · อนุมัติแล้วหรือยัง (ใช้ประเมินความเสี่ยงงาน)
   สิ่งที่ต้องปิด: ประเภทการลา (ลาป่วย = ข้อมูลสุขภาพ) และปุ่มอนุมัติ */
const { chromium, EXE, BASE } = require('./env');
const TYPES = ['ลาป่วย', 'ลากิจ', 'ลาพักร้อน'];

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errors = [];
  const bad = m => fails.push(m);

  const staffIds = await (async () => {
    const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(BASE + '/index.html');
    const ids = await p.$$eval('#lgUsers [data-id]', e => e.map(x => x.dataset.id));
    await ctx.close(); return ids;
  })();

  for (const sid of staffIds) {
    const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(sid + ' PAGEERROR ' + e.message));
    await p.goto(BASE + '/index.html');
    await p.click('#lgUsers [data-id="' + sid + '"]');
    await p.click('#lgGo'); await p.waitForTimeout(400);
    const role = await p.evaluate(() => ME.role);
    if (!await p.evaluate(() => canSee('hr'))) { await ctx.close(); continue; }

    /* วางใบลาของเพื่อนร่วมงานในสาขาเดียวกันให้ครบทุกประเภท เพื่อให้มีอะไรให้รั่วจริง */
    const seeded = await p.evaluate(ts => {
      const mate = STAFF.find(s => s.id !== ME.id && inScope(s.branch));
      if (!mate) return null;
      ts.forEach((t, i) => LEAVES.push({ id: 'LVT' + i, staffId: mate.id, type: t,
        from: addDays(curDate(), 3 + i), to: addDays(curDate(), 4 + i), status: i ? 'อนุมัติแล้ว' : 'รออนุมัติ' }));
      return { nick: mate.nick, from: addDays(curDate(), 3) };
    }, TYPES);
    if (!seeded) { await ctx.close(); continue; }

    await p.evaluate(() => go('hr')); await p.waitForTimeout(300);
    await p.evaluate(() => { const bs = [...document.querySelectorAll('#hrTabs button')]; bs[1].click(); });
    await p.waitForTimeout(300);

    /* v1.16: สิทธิ์เห็นประเภทการลาผูกกับ canFixAtt() เท่านั้น — บิต approve ของ "การเงิน"
       มีไว้ตรวจการขาย/ค่าใช้จ่าย ต้องไม่พ่วงเห็นข้อมูลสุขภาพ (privacy-r5 คุมฝั่งห้ามเห็น) */
    const boss = await p.evaluate(() => canFixAtt());
    const txt = await p.$eval('#lvTable', e => e.textContent);

    /* 1 · ต้องเห็นชื่อและวันที่ของเพื่อนร่วมงาน — ทุกบทบาท */
    if (!txt.includes(seeded.nick))
      bad('[' + role + '] ไม่เห็นชื่อเพื่อนร่วมงานในตารางใบลา (ควรเห็นตั้งแต่ v1.11)');
    const dateTxt = await p.evaluate(d => thDate(d), seeded.from);
    if (!txt.includes(dateTxt))
      bad('[' + role + '] ไม่เห็นวันที่ลาของเพื่อนร่วมงาน (' + dateTxt + ')');
    /* สถานะต้องเห็น เพราะ "อนุมัติแล้ว" กับ "รออนุมัติ" คือข้อมูลที่ใช้ประเมินความเสี่ยง */
    if (!txt.includes('อนุมัติแล้ว'))
      bad('[' + role + '] ไม่เห็นสถานะใบลาของเพื่อนร่วมงาน');

    /* 2 · ประเภทการลาของคนอื่นต้องไม่หลุด (ยกเว้นผู้มีสิทธิ์ตรวจ) */
    const mineTypes = await p.evaluate(() => LEAVES.filter(l => l.staffId === ME.id).map(l => l.type));
    const leak = TYPES.filter(t => txt.includes(t) && mineTypes.indexOf(t) < 0);
    if (!boss && leak.length) bad('[' + role + '] ตารางใบลาหลุดประเภทการลาของคนอื่น: ' + leak.join(', '));
    if (boss && leak.length !== TYPES.filter(t => mineTypes.indexOf(t) < 0).length)
      bad('[' + role + '] ผู้มีสิทธิ์ตรวจกลับไม่เห็นประเภทการลา');

    /* 3 · ปุ่มอนุมัติมีเฉพาะคนที่มีสิทธิ์ และอนุมัติของตัวเองไม่ได้ */
    const canApprove = await p.evaluate(() => rolePerm().approve);
    const nBtn = await p.$$eval('#lvTable [data-lv]', e => e.length);
    if (!canApprove && nBtn) bad('[' + role + '] ไม่มีสิทธิ์อนุมัติแต่มีปุ่มอนุมัติ ' + nBtn + ' ปุ่ม');
    const own = await p.evaluate(() => {
      const l = LEAVES.find(x => x.staffId === ME.id && x.status === 'รออนุมัติ');
      if (!l) { LEAVES.push({ id: 'LVSELF', staffId: ME.id, type: 'ลากิจ',
        from: addDays(curDate(), 9), to: addDays(curDate(), 9), status: 'รออนุมัติ' }); rHr(); }
      const t = LEAVES.find(x => x.staffId === ME.id && x.status === 'รออนุมัติ');
      return !!document.querySelector('#lvTable [data-lv="' + t.id + '"]');
    });
    if (own) bad('[' + role + '] มีปุ่มอนุมัติใบลาของตัวเอง');

    /* 4 · ปฏิทินโชว์วันลาของทีม แต่ป้ายต้องไม่บอกประเภท */
    if (await p.evaluate(() => canSee('cal'))) {
      const cal = await p.evaluate(() => {
        const ev = calEvents().filter(e => e.k === 'leave');
        const me = (STAFF.find(s => s.id === ME.id) || {}).nick;
        return { others: ev.filter(e => !e.t.includes(me)).map(e => e.t) };
      });
      if (!cal.others.length) bad('[' + role + '] ปฏิทินไม่โชว์วันลาของเพื่อนร่วมงานเลย');
      const leakCal = cal.others.filter(t => TYPES.some(x => t.includes(x)));
      if (leakCal.length) bad('[' + role + '] ปฏิทินหลุดประเภทการลา: ' + leakCal.slice(0, 2).join(', '));
    }

    /* 5 · ยื่นใบลาแทนคนอื่นยังต้องไม่ได้ (ด่านเดิมต้องไม่หลุดไปกับการเปิดสิทธิ์อ่าน) */
    if (!await p.evaluate(() => canFixAtt())) {
      const forged = await p.evaluate(() => {
        const other = STAFF.find(s => s.id !== ME.id);
        const sel = document.querySelector('#lvWho');
        sel.innerHTML = '<option value="' + other.id + '">x</option>'; sel.value = other.id;
        const n = LEAVES.length;
        document.querySelector('#lvSave').click();
        return LEAVES.slice(n).some(l => l.staffId !== ME.id);
      });
      if (forged) bad('[' + role + '] ยื่นใบลาแทนคนอื่นได้');
    }

    await ctx.close();
  }

  console.log(fails.length ? 'FAILS:\n' + [...new Set(fails)].join('\n') : 'ALL_CHECKS_PASS');
  console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})();
