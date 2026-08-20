/* ด่านของหน้า "ลูกค้าและดีล" — หน้าเดียวที่รวมงานลูกค้า ขาย ไฟแนนซ์ ทะเบียน
   หัวใจที่ต้องพิสูจน์: ขั้นที่โชว์ "คำนวณ" จาก SALES/FINCASES/REGS จริง ไม่ใช่ฟิลด์ที่เก็บไว้
   และทุกปุ่มทำงานแล้วอยู่หน้าเดิม (CUR ต้องไม่เปลี่ยน) ไม่มีการเด้งข้ามหน้าอีก */
const { chromium, EXE, BASE } = require('./env');
const ROLES = ['ST1', 'ST2', 'ST4', 'ST3'];   /* admin · manager · (บัญชี/เซลล์ ตามลำดับใน STAFF) */

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errors = [];
  const bad = m => fails.push(m);

  /* ---------- ก. ตรรกะการคิดขั้น: ยิงทุกคอมบิเนชันของระเบียนจริง ---------- */
  {
    const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
    await p.goto(BASE + '/index.html');
    await p.click('#lgGo'); await p.waitForTimeout(400);

    const cases = await p.evaluate(() => {
      const out = [];
      const c = CUSTOMERS.filter(x => inScope(x.branch)).find(x => SALES.some(s => s.custId === x.id && !s.void));
      const s = SALES.find(x => x.custId === c.id && !x.void);
      const fc = FINCASES.find(x => x.saleId === s.id);
      const rg = REGS.find(x => x.saleId === s.id);
      const snap = () => { const d = dealOf(c.id); return { k: d.k, off: d.off, n: d.track.length, i: d.i }; };
      /* ผ่อน + เคสยังไม่จบ → ขั้นไฟแนนซ์ (ขั้นที่ 2 ตามลำดับใหม่ v1.28) */
      s.pay = 'finance'; fc.status = 'รอผล'; rg.stage = 'ส่งไฟแนนซ์';
      delete rg.deliveredAt; delete s.deliveredAt; rg.plate = '';
      out.push(['ผ่อน · รอผล', snap()]);
      /* ผ่อน + ปฏิเสธ → ตกรางที่ไฟแนนซ์ */
      fc.status = 'ปฏิเสธ'; out.push(['ผ่อน · ปฏิเสธ', snap()]);
      /* ผ่อน + อนุมัติ → เปิดการขายติ๊กแล้ว ตัวชี้ไปรอส่งมอบ */
      fc.status = 'อนุมัติแล้ว'; rg.stage = 'อนุมัติ'; out.push(['ผ่อน · อนุมัติ', snap()]);
      /* ส่งมอบแล้ว → นับว่าจบงาน แต่ยังเหลือขั้นทะเบียนจริง */
      rg.stage = 'ส่งมอบแล้ว'; rg.deliveredAt = curDate(); out.push(['ส่งมอบแล้ว', snap()]);
      /* ได้ทะเบียนจริง → จบครบ แถบเต็ม */
      rg.stage = 'ได้ทะเบียนแล้ว'; rg.plate = '1กก 1234'; out.push(['ได้ทะเบียนแล้ว', snap()]);
      /* เงินสด → เส้นทาง 4 ขั้น ไม่มีไฟแนนซ์ */
      rg.stage = 'ขายแล้ว'; rg.plate = ''; delete rg.deliveredAt; delete s.deliveredAt;
      s.pay = 'cash'; out.push(['เงินสด', snap()]);
      /* ไม่มีการขาย → ขั้นแรก */
      const lead = CUSTOMERS.filter(x => inScope(x.branch)).find(x => !SALES.some(y => y.custId === x.id && !y.void));
      out.push(['ยังไม่ซื้อ', lead ? (() => { const d = dealOf(lead.id); return { k: d.k, off: d.off, n: d.track.length, i: d.i }; })() : null]);
      return out;
    });
    const want = {
      'ผ่อน · รอผล':    { k: 'fin',     off: false, n: 5, i: 1 },
      'ผ่อน · ปฏิเสธ':  { k: 'fin',     off: true,  n: 5, i: 1 },
      'ผ่อน · อนุมัติ':  { k: 'deliver', off: false, n: 5, i: 3 },
      'ส่งมอบแล้ว':      { k: 'plate',   off: false, n: 5, i: 4 },
      'ได้ทะเบียนแล้ว': { k: 'done',    off: false, n: 5, i: 5 },
      'เงินสด':          { k: 'deliver', off: false, n: 4, i: 2 },
      'ยังไม่ซื้อ':       { k: 'lead',    off: false, n: 5, i: 0 },
    };
    for (const [name, got] of cases) {
      const w = want[name];
      if (!got) { bad('ตรรกะขั้น "' + name + '": ไม่มีเคสให้ทดสอบใน seed'); continue; }
      if (JSON.stringify(got) !== JSON.stringify(w))
        bad('ตรรกะขั้น "' + name + '": ได้ ' + JSON.stringify(got) + ' ควรเป็น ' + JSON.stringify(w));
    }
    await ctx.close();
  }

  /* ---------- ข. หน้าจอจริง 4 บทบาท × 2 ความกว้าง ---------- */
  for (const W of [1440, 390]) {
    for (const staff of ROLES) {
      const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: W, height: 900 } });
      const p = await ctx.newPage();
      await p.goto(BASE + '/index.html');
      await p.click('#lgUsers [data-id="' + staff + '"]');
      await p.click('#lgGo'); await p.waitForTimeout(400);
      const role = await p.evaluate(() => ME.role);
      const tag = W + 'px/' + role;
      p.on('pageerror', e => errors.push(tag + ' PAGEERROR ' + e.message));

      if (!await p.evaluate(() => canSee('deal'))) { await ctx.close(); continue; }
      await p.evaluate(() => go('deal')); await p.waitForTimeout(400);

      /* รายการต้องวาดครบและทุกแถวมีแถบ */
      const nRows = await p.$$eval('#dlTable [data-deal]', e => e.length);
      const nBars = await p.$$eval('#dlTable .pstep', e => e.length);
      if (!nRows) bad(tag + ': รายการดีลว่างเปล่า');
      if (nBars !== nRows) bad(tag + ': มี ' + nRows + ' แถว แต่มีแถบ ' + nBars + ' อัน');
      if (!await p.isVisible('#dlList')) bad(tag + ': เข้าหน้ามาไม่ได้เริ่มที่มุมมองรายการ');
      if (await p.isVisible('#dlOne')) bad(tag + ': มุมมองรายละเอียดโผล่มาทั้งที่ยังไม่ได้เลือกใคร');

      /* แตะแถว → รายละเอียด และต้องยังอยู่หน้า deal */
      await p.click('#dlTable [data-deal]'); await p.waitForTimeout(350);
      if (await p.evaluate(() => CUR) !== 'deal') bad(tag + ': แตะแถวแล้วเด้งออกจากหน้าดีล');
      if (!await p.isVisible('#dlOne')) bad(tag + ': แตะแถวแล้วไม่เปิดรายละเอียด');
      if (await p.isVisible('#dlList')) bad(tag + ': เปิดรายละเอียดแล้วรายการยังค้างอยู่');
      if (!await p.$('#dlOne .phead b')) bad(tag + ': รายละเอียดไม่มีหัวเรื่อง');
      if (!await p.$('#dlOne .pstep.lab')) bad(tag + ': รายละเอียดไม่มีแถบแบบมีชื่อขั้น');

      /* ปุ่มย้อนกลับ */
      await p.click('#dlBack'); await p.waitForTimeout(300);
      if (!await p.isVisible('#dlList')) bad(tag + ': กดย้อนกลับแล้วไม่กลับมาที่รายการ');

      /* ตัวกรอง: เลือกขั้นตอนแล้วทุกแถวต้องเป็นขั้นนั้น */
      const stOpt = await p.$$eval('#dlStage option', e => e.map(x => x.value).filter(Boolean));
      if (stOpt.length < 5) bad(tag + ': ตัวกรองขั้นตอนมีแค่ ' + stOpt.length + ' ตัวเลือก');
      /* ที่ 390px ตัวกรองถูกย้ายเข้าแผ่นล่างและซ่อนไว้ ยิงผ่าน DOM แทนการคลิก
         (จุดที่ต้องพิสูจน์คือตรรกะการกรอง ไม่ใช่ตำแหน่งของคอนโทรล) */
      const setF = (id, v) => p.evaluate(([i, x]) => { const el = document.getElementById(i);
        el.value = x; if (el.onchange) el.onchange(); if (el.oninput) el.oninput(); }, [id, v]);
      for (const st of stOpt) {
        await setF('dlStage', st); await p.waitForTimeout(200);
        const okAll = await p.evaluate(s => dealRows().every(d => dealStageName(d) === s), st);
        if (!okAll) bad(tag + ': กรอง "' + st + '" แล้วยังมีดีลขั้นอื่นปนมา');
      }
      await setF('dlStage', ''); await p.waitForTimeout(150);
      await setF('dlQ', 'ไม่มีใครชื่อนี้แน่นอน'); await p.waitForTimeout(250);
      if (await p.$$eval('#dlTable [data-deal]', e => e.length)) bad(tag + ': ค้นหาคำที่ไม่มีแล้วยังมีแถวโผล่');
      if (!await p.$('#dlTable .empty')) bad(tag + ': ค้นหาไม่เจอแล้วไม่ขึ้นข้อความว่าง');
      await setF('dlQ', ''); await p.waitForTimeout(250);

      /* ไม่มีการเลื่อนซ้าย-ขวา ทั้งมุมมองรายการและรายละเอียด */
      for (const view of ['list', 'one']) {
        if (view === 'one') { await p.click('#dlTable [data-deal]'); await p.waitForTimeout(300); }
        const over = await p.evaluate(() => document.body.scrollWidth - window.innerWidth);
        if (over > 1) bad(tag + ' (' + view + '): ล้นออกข้าง ' + over + 'px');
        const barOver = await p.evaluate(() => Math.max(0, ...Array.from(document.querySelectorAll('#s-deal .pstep'))
          .map(e => e.scrollWidth - e.clientWidth)));
        if (barOver > 1) bad(tag + ' (' + view + '): แถบล้นกรอบตัวเอง ' + barOver + 'px');
      }
      await ctx.close();
    }
  }

  /* ---------- ค. เดินดีลจนจบจากหน้าเดียว + ด่านเลขทะเบียน ---------- */
  {
    const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push('walk PAGEERROR ' + e.message));
    await p.goto(BASE + '/index.html');
    await p.click('#lgGo'); await p.waitForTimeout(400);
    await p.evaluate(() => go('deal')); await p.waitForTimeout(300);
    const cid = await p.evaluate(() => { const d = dealAll().find(x => x.k === 'fin' && !x.off); return d ? d.c.id : null; });
    if (!cid) bad('ไม่มีดีลที่ค้างขั้นไฟแนนซ์ใน seed');
    else {
      await p.evaluate(id => { DEAL_SEL = id; rDeal(); }, cid);
      await p.waitForTimeout(300);
      let guard = 0;
      while (await p.$('#dlOne [data-dlfnext]') && guard++ < 8) {
        await p.click('#dlOne [data-dlfnext]'); await p.waitForTimeout(200);
        if (await p.evaluate(() => CUR) !== 'deal') { bad('เดินขั้นไฟแนนซ์แล้วเด้งออกจากหน้าดีล'); break; }
      }
      if (guard >= 8) bad('เดินขั้นไฟแนนซ์ไม่จบใน 8 ครั้ง — อาจวนลูป');
      const k1 = await p.evaluate(id => dealOf(id).k, cid);
      /* v1.28: อนุมัติแล้วขั้น "เปิดการขาย" ติ๊ก ตัวชี้ไปรอส่งมอบ */
      if (k1 !== 'deliver') bad('ไฟแนนซ์อนุมัติครบแล้วแต่ยังไม่ไปขั้นรอส่งมอบ (k=' + k1 + ')');

      /* ด่าน: ปิดงานทะเบียนไม่ได้ถ้ายังไม่กรอกเลขทะเบียน (ด่านเดิม ย้ายมาขั้นสุดท้าย) */
      guard = 0;
      while (guard++ < 10) {
        const btn = await p.$('#dlOne [data-dlrnext]');
        if (!btn) break;
        const label = (await btn.textContent()).trim();
        if (/ได้ทะเบียนแล้ว/.test(label)) {
          const before = await p.evaluate(id => dealOf(id).rg.stage, cid);
          if (await p.$('#dlPlate')) await p.fill('#dlPlate', '');
          await btn.click(); await p.waitForTimeout(200);
          const after = await p.evaluate(id => dealOf(id).rg.stage, cid);
          if (after !== before) bad('ปิดงานทะเบียนได้ทั้งที่ยังไม่กรอกเลขทะเบียน');
          await p.fill('#dlPlate', '1กก 9999');
          await p.click('#dlOne [data-dlrnext]'); await p.waitForTimeout(200);
          continue;
        }
        await btn.click(); await p.waitForTimeout(200);
      }
      if (guard >= 10) bad('เดินขั้นทะเบียนไม่จบใน 10 ครั้ง — อาจวนลูป');
      const fin = await p.evaluate(id => ({ k: dealOf(id).k, stage: CUSTOMERS.find(c => c.id === id).stage,
        plate: dealOf(id).rg.plate, cur: CUR }), cid);
      if (fin.k !== 'done')  bad('เดินจนจบแล้วยังไม่ถึงขั้นสุดท้าย (k=' + fin.k + ')');
      if (fin.stage !== 'รับรถสำเร็จ') bad('ส่งมอบแล้วแต่ลูกค้าไม่ได้เป็น "รับรถสำเร็จ" (' + fin.stage + ')');
      if (fin.plate !== '1กก 9999') bad('เลขทะเบียนที่กรอกไม่ได้ถูกเก็บ (' + fin.plate + ')');
      if (fin.cur !== 'deal') bad('เดินจนจบแล้วหลุดออกจากหน้าดีล');
    }
    await ctx.close();
  }

  console.log(fails.length ? 'FAILS:\n' + [...new Set(fails)].join('\n') : 'ALL_CHECKS_PASS');
  console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})();
