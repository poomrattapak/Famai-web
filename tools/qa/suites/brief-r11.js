/* ด่านของข้อที่ยังค้างจากบรีฟ 13 ข้อ — เก็บให้ครบในรอบ v1.12
   ข้อ 3  dropdown รุ่น + สี ในหน้าสต๊อก
   ข้อ 9  สถานะ "ไม่ผ่าน" ต้องบอกเหตุผล และถ้าติดไฟแนนซ์ต้องบอกว่าเจ้าไหน
   ข้อ 4  ค่าใช้จ่าย: พนักงานที่เบิก + จำหมวดหมู่และผู้ขายไว้ใช้ครั้งต่อไป
   ข้อ 2  หน้าแรกเลือกช่วงเวลาเองได้ + ส่งออก/พิมพ์ตามช่วงที่เลือก */
const { chromium, EXE, BASE } = require('./env');

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errors = [];
  const bad = m => fails.push(m);
  const open = async (W, staff) => {
    const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: W, height: 900 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(W + 'px PAGEERROR ' + e.message));
    await p.goto(BASE + '/index.html');
    if (staff) await p.click('#lgUsers [data-id="' + staff + '"]');
    await p.click('#lgGo'); await p.waitForTimeout(400);
    return { ctx, p };
  };
  /* ที่ 390px ตัวกรองถูกย้ายเข้าแผ่นล่างและซ่อนไว้ ยิงผ่าน DOM แทนการคลิก */
  const setF = (p, id, v) => p.evaluate(([i, x]) => { const el = document.getElementById(i);
    el.value = x; if (el.onchange) el.onchange(); if (el.oninput) el.oninput(); }, [id, v]);

  for (const W of [1440, 390]) {
    const tag = W + 'px';

    /* ===================== ข้อ 3 · dropdown รุ่น + สี ===================== */
    {
      const { ctx, p } = await open(W);
      await p.evaluate(() => go('stock')); await p.waitForTimeout(350);

      if (!await p.$('#stColor')) bad(tag + ' [ข้อ3]: ไม่มี dropdown สีในหน้าสต๊อก');
      else {
        const all = await p.$$eval('#stColor option', e => e.map(x => x.value).filter(Boolean));
        const real = await p.evaluate(() => [...new Set(UNITS.filter(u => inScope(u.branch)).map(u => u.color))].filter(Boolean));
        if (all.length !== real.length)
          bad(tag + ' [ข้อ3]: ตัวเลือกสีมี ' + all.length + ' ควรเป็น ' + real.length + ' (เท่าสีที่มีจริงในสาขาที่ดูแล)');

        /* เลือกสีแล้วต้องเหลือเฉพาะสีนั้น */
        await setF(p, 'stColor', all[0]); await p.waitForTimeout(250);
        const okColor = await p.evaluate(c => stList().length > 0 && stList().every(u => u.color === c), all[0]);
        if (!okColor) bad(tag + ' [ข้อ3]: กรองสี "' + all[0] + '" แล้วยังมีสีอื่นปนหรือไม่เหลืออะไรเลย');
        await setF(p, 'stColor', ''); await p.waitForTimeout(200);

        /* สีต้องผูกกับรุ่นที่เลือก — เลือกรุ่นแล้วต้องเห็นเฉพาะสีที่รุ่นนั้นมีจริง */
        const model = await p.evaluate(() => { const m = UNITS.filter(u => inScope(u.branch))[0]; return m.model; });
        await setF(p, 'stModel', model); await p.waitForTimeout(250);
        const forModel = await p.$$eval('#stColor option', e => e.map(x => x.value).filter(Boolean));
        const want = await p.evaluate(m => [...new Set(UNITS.filter(u => inScope(u.branch) && u.model === m).map(u => u.color))].filter(Boolean), model);
        if (forModel.slice().sort().join('|') !== want.slice().sort().join('|'))
          bad(tag + ' [ข้อ3]: เลือกรุ่น "' + model + '" แล้วตัวเลือกสีเป็น [' + forModel + '] ควรเป็น [' + want + ']');

        /* สีที่ค้างอยู่แต่รุ่นใหม่ไม่มี ต้องถูกล้าง ไม่งั้นตารางว่างโดยไม่รู้สาเหตุ */
        await setF(p, 'stColor', forModel[0]); await p.waitForTimeout(200);
        const other = await p.evaluate(([m, c]) => { const u = UNITS.find(x => inScope(x.branch) && x.model !== m && x.color !== c);
          return u ? u.model : null; }, [model, forModel[0]]);
        if (other) {
          await setF(p, 'stModel', other); await p.waitForTimeout(250);
          const stuck = await p.evaluate(() => $('#stColor').value);
          const has = await p.evaluate(([m, c]) => UNITS.some(u => inScope(u.branch) && u.model === m && u.color === c), [other, forModel[0]]);
          if (!has && stuck) bad(tag + ' [ข้อ3]: เปลี่ยนรุ่นแล้วสีเดิมที่รุ่นใหม่ไม่มียังค้างอยู่ (' + stuck + ')');
        }
        /* ตัวกรองต้องอยู่ในแผ่นตัวกรองด้วย ไม่งั้นบนมือถือกดไม่ถึง */
        const inSheet = await p.evaluate(() => FILTERS.stock.f.some(f => f[0] === 'stColor'));
        if (!inSheet) bad(tag + ' [ข้อ3]: สีไม่ได้อยู่ในแผ่นตัวกรอง — บนมือถือจะกดไม่ถึง');
      }
      await ctx.close();
    }

    /* ===================== ข้อ 9 · เหตุผลที่ไม่ผ่าน ===================== */
    {
      const { ctx, p } = await open(W);
      await p.evaluate(() => go('deal')); await p.waitForTimeout(300);

      /* ข้อมูลตัวอย่างต้องมีเคสที่บอกเหตุผลไว้แล้ว ไม่ใช่แค่ "ปฏิเสธ" ลอย ๆ */
      const seeded = await p.evaluate(() => { const d = dealAll().find(x => x.off); return d ? { id: d.c.id,
        r: d.fc.rejectReason, w: d.fc.rejectWith } : null; });
      if (!seeded) bad(tag + ' [ข้อ9]: ไม่มีเคสที่ไม่ผ่านใน seed');
      else {
        if (!seeded.r) bad(tag + ' [ข้อ9]: เคสที่ไม่ผ่านใน seed ไม่มีเหตุผล');
        await p.evaluate(id => dealGo(id), seeded.id); await p.waitForTimeout(350);
        const head = await p.$eval('#dlOne .phead b', e => e.textContent.trim());
        if (seeded.r && head.indexOf(seeded.r) < 0)
          bad(tag + ' [ข้อ9]: หัวเรื่องไม่บอกเหตุผล ได้ "' + head + '"');
        if (seeded.w && head.indexOf(seeded.w) < 0)
          bad(tag + ' [ข้อ9]: หัวเรื่องไม่บอกว่าติดไฟแนนซ์เจ้าไหน (' + seeded.w + ')');
        const body = await p.$eval('#dlOne', e => e.textContent);
        if (body.indexOf('เหตุผลที่ไม่ผ่าน') < 0) bad(tag + ' [ข้อ9]: รายละเอียดเคสไม่มีบรรทัดเหตุผล');
        /* ติดไฟแนนซ์เจ้าอื่น = ยื่นเจ้าใหม่ก็ไม่ผ่าน ต้องบอกให้ชัดว่าคนละทางกับเหตุผลอื่น */
        if (seeded.w) {
          const sub = await p.$eval('#dlOne .phead span', e => e.textContent);
          if (sub.indexOf(seeded.w) < 0) bad(tag + ' [ข้อ9]: บรรทัดรองไม่บอกว่าต้องเคลียร์กับเจ้าไหนก่อน');
        }
      }

      /* กดปฏิเสธต้องถามเหตุผลก่อนเสมอ และบังคับกรอกให้ครบ */
      const cid = await p.evaluate(() => { const d = dealAll().find(x => x.k === 'fin' && !x.off && x.fc);
        if (d) dealGo(d.c.id); return d ? d.c.id : null; });
      if (!cid) bad(tag + ' [ข้อ9]: ไม่มีเคสสินเชื่อที่ยังไม่จบใน seed');
      else {
        await p.waitForTimeout(300);
        await p.click('#dlOne [data-dlfrej]'); await p.waitForTimeout(300);
        if (!await p.$('#rjWhy')) bad(tag + ' [ข้อ9]: กดปฏิเสธแล้วไม่ถามเหตุผล');
        else {
          await p.click('#rjGo'); await p.waitForTimeout(250);
          /* ถ้าด่านหลุด แผ่นจะปิดไปแล้ว ต้องรายงานแล้วข้ามส่วนที่เหลือ ไม่ใช่ปล่อยให้เทสต์ตาย */
          if (await p.evaluate(id => dealOf(id).fc.status === 'ปฏิเสธ', cid)
              || !await p.$('#rjWhy')) {
            bad(tag + ' [ข้อ9]: บันทึกปฏิเสธได้ทั้งที่ยังไม่เลือกเหตุผล');
            await ctx.close(); continue;
          }
          await p.selectOption('#rjWhy', 'ติดไฟแนนซ์เจ้าอื่น'); await p.waitForTimeout(200);
          if (!await p.isVisible('#rjWith')) bad(tag + ' [ข้อ9]: เลือก "ติดไฟแนนซ์เจ้าอื่น" แล้วไม่ถามว่าเจ้าไหน');
          await p.click('#rjGo'); await p.waitForTimeout(250);
          if (await p.evaluate(id => dealOf(id).fc.status === 'ปฏิเสธ', cid) || !await p.$('#rjWith')) {
            bad(tag + ' [ข้อ9]: บันทึกได้ทั้งที่ยังไม่บอกว่าติดเจ้าไหน');
            await ctx.close(); continue;
          }
          await p.fill('#rjWith', 'เกียรตินาคิน');
          await p.click('#rjGo'); await p.waitForTimeout(400);
          const got = await p.evaluate(id => { const f = dealOf(id).fc;
            return { s: f.status, r: f.rejectReason, w: f.rejectWith, log: (f.log || []).map(l => l.to).join('|') }; }, cid);
          if (got.s !== 'ปฏิเสธ')  bad(tag + ' [ข้อ9]: กรอกครบแล้วยังบันทึกไม่ได้');
          if (got.w !== 'เกียรตินาคิน') bad(tag + ' [ข้อ9]: ชื่อไฟแนนซ์ที่ติดไม่ถูกเก็บ (' + got.w + ')');
          if (got.log.indexOf('เกียรตินาคิน') < 0) bad(tag + ' [ข้อ9]: ประวัติเคสไม่ได้บันทึกเหตุผล');
          const h2 = await p.$eval('#dlOne .phead b', e => e.textContent);
          if (h2.indexOf('เกียรตินาคิน') < 0) bad(tag + ' [ข้อ9]: บันทึกแล้วหัวเรื่องไม่อัปเดต');

          /* ยื่นใหม่แล้วเหตุผลเดิมต้องถูกล้าง ไม่งั้นค้างไว้ทำให้อ่านผิด */
          await p.click('#dlOne [data-dlresub]'); await p.waitForTimeout(300);
          if (await p.$('#rsGo')) {
            await p.click('#rsGo'); await p.waitForTimeout(400);
            const after = await p.evaluate(id => { const f = dealOf(id).fc;
              return { s: f.status, r: f.rejectReason || '', w: f.rejectWith || '' }; }, cid);
            if (after.s !== 'ส่งเรื่อง') bad(tag + ' [ข้อ9]: ยื่นใหม่แล้วสถานะเป็น ' + after.s);
            if (after.r || after.w) bad(tag + ' [ข้อ9]: ยื่นใหม่แล้วเหตุผลเดิมยังค้าง (' + after.r + '/' + after.w + ')');
          }
        }
      }
      await ctx.close();
    }

    /* ===================== ข้อ 4 · ค่าใช้จ่าย ===================== */
    {
      const { ctx, p } = await open(W);
      await p.evaluate(() => go('expense')); await p.waitForTimeout(350);

      if (!await p.$('#eStaff')) bad(tag + ' [ข้อ4]: ไม่มีช่อง "พนักงานที่เบิก"');
      else {
        /* ค่าเริ่มต้นเป็นตัวเอง และเลือกได้เฉพาะคนในสาขาที่ดูแล */
        const st = await p.evaluate(() => ({ val: $('#eStaff').value, me: ME.id,
          opts: [...document.querySelectorAll('#eStaff option')].map(o => o.value),
          scoped: STAFF.filter(x => inScope(x.branch)).map(x => x.id) }));
        if (st.val !== st.me) bad(tag + ' [ข้อ4]: ค่าเริ่มต้นของผู้เบิกไม่ใช่ตัวเอง');
        if (st.opts.slice().sort().join() !== st.scoped.slice().sort().join())
          bad(tag + ' [ข้อ4]: ตัวเลือกผู้เบิกไม่ตรงกับพนักงานในสาขาที่ดูแล');

        /* จำหมวดหมู่และผู้ขายที่เคยกรอก */
        const before = await p.evaluate(() => ({
          cats: [...document.querySelectorAll('#eCatList option')].map(o => o.value),
          vens: [...document.querySelectorAll('#eVenList option')].map(o => o.value) }));
        if (!before.cats.length) bad(tag + ' [ข้อ4]: ไม่มีรายการหมวดหมู่แนะนำ');
        if (!before.vens.length) bad(tag + ' [ข้อ4]: ไม่มีรายการผู้ขายแนะนำ');
        const NEWCAT = 'ค่าโฆษณาทดสอบ', NEWVEN = 'ร้านทดสอบ จำกัด';
        await p.evaluate(([c, v]) => { $('#eCat').value = c; $('#eVendor').value = v; $('#eAmt').value = '3500'; },
          [NEWCAT, NEWVEN]);
        await p.click('#eSave'); await p.waitForTimeout(250);
        /* v1.16: มี popup ยืนยันก่อนบันทึก (บรีฟ L1) — ต้องกดยืนยันและต้องยังไม่บันทึกก่อนกด */
        const preConfirm = await p.evaluate(() => ({
          open: $('#modal').classList.contains('on') && !!$('#cfmGo'),
          last: (EXPENSES[EXPENSES.length - 1] || {}).cat }));
        if (!preConfirm.open) bad(tag + ' [ข้อ4]: ไม่มี popup ยืนยันก่อนบันทึกค่าใช้จ่าย');
        if (preConfirm.last === NEWCAT) bad(tag + ' [ข้อ4]: บันทึกก่อนกดยืนยัน — popup เป็นแค่พิธี');
        await p.evaluate(() => { const b = $('#cfmGo'); if (b) b.onclick(); });
        await p.waitForTimeout(250);
        const rec = await p.evaluate(() => EXPENSES[EXPENSES.length - 1]);
        if (rec.cat !== NEWCAT) bad(tag + ' [ข้อ4]: หมวดที่พิมพ์เองไม่ถูกบันทึก');
        if (!rec.by || !rec.byName) bad(tag + ' [ข้อ4]: ไม่ได้บันทึกว่าใครเป็นคนเบิก');
        const after = await p.evaluate(() => ({
          cats: [...document.querySelectorAll('#eCatList option')].map(o => o.value),
          vens: [...document.querySelectorAll('#eVenList option')].map(o => o.value) }));
        if (after.cats.indexOf(NEWCAT) < 0) bad(tag + ' [ข้อ4]: หมวดใหม่ไม่ถูกจำไว้ใช้ครั้งต่อไป');
        if (after.vens.indexOf(NEWVEN) < 0) bad(tag + ' [ข้อ4]: ผู้ขายใหม่ไม่ถูกจำไว้ใช้ครั้งต่อไป');

        /* ผู้เบิกต้องโผล่ในตาราง และในไฟล์ส่งออก */
        const shown = await p.evaluate(n => document.querySelector('#eTable').textContent.indexOf(n) >= 0, rec.byName);
        if (!shown) bad(tag + ' [ข้อ4]: ตารางค่าใช้จ่ายไม่แสดงผู้เบิก');

        /* ด่านอยู่ในตัวบันทึก: ไม่กรอกหมวด และผู้เบิกที่ไม่มีอยู่จริง ต้องบันทึกไม่ได้ */
        const blocked = await p.evaluate(() => {
          const n0 = EXPENSES.length;
          $('#eCat').value = ''; $('#eAmt').value = '100'; $('#eSave').click();
          const noCat = EXPENSES.length === n0;
          $('#eCat').value = 'ทดสอบ';
          $('#eStaff').innerHTML = '<option value="ไม่มีคนนี้">x</option>'; $('#eStaff').value = 'ไม่มีคนนี้';
          $('#eSave').click();
          return { noCat, badStaff: EXPENSES.length === n0 };
        });
        if (!blocked.noCat) bad(tag + ' [ข้อ4]: บันทึกได้ทั้งที่ไม่กรอกหมวดหมู่');
        if (!blocked.badStaff) bad(tag + ' [ข้อ4]: บันทึกให้คนที่ไม่มีอยู่จริงได้ — ด่านไม่ได้อยู่ในฟังก์ชัน');
      }
      await ctx.close();
    }

    /* ===================== ข้อ 2 · ช่วงเวลาบนหน้าแรก ===================== */
    {
      const { ctx, p } = await open(W);
      await p.evaluate(() => { window.__pr = 0; window.print = () => { window.__pr++; }; });
      await p.waitForTimeout(200);
      /* v1.26 ข้อ 3: แถบช่วงเวลาย้ายขึ้น navbar (#navPerBox) — ที่ 390 ต้องเปิดแผ่นจาก #npBtn ก่อน
         คำยืนยันทุกข้อด้านล่างคงเดิม เปลี่ยนเฉพาะที่อยู่ของ control */
      if (W === 390) { await p.click('#npBtn'); await p.waitForTimeout(250); }

      const quick = await p.$$eval('#navPerBox [data-pr]', e => e.map(x => x.dataset.pr));
      for (const need of ['1', '7', '30']) if (quick.indexOf(need) < 0)
        bad(tag + ' [ข้อ2]: ไม่มีปุ่มลัด ' + need + ' วัน');
      if (!await p.$('#navPerBox [data-pcus]')) bad(tag + ' [ข้อ2]: ไม่มีปุ่มเลือกช่วงเวลาเอง');
      else {
        /* ปุ่มลัดต้องได้ช่วงที่ถูกต้องและตัวเลขต้องตามไปด้วย */
        await p.click('#navPerBox [data-pr="1"]'); await p.waitForTimeout(300);
        const one = await p.evaluate(() => ({ p: dPeriod(),
          ok: dSales().every(s => s.soldAt === curDate()) }));
        if (one.p.from !== one.p.to) bad(tag + ' [ข้อ2]: ปุ่ม "วันนี้" ไม่ได้ช่วงวันเดียว');
        if (!one.ok) bad(tag + ' [ข้อ2]: ปุ่ม "วันนี้" แต่ยังมีการขายวันอื่นปนมา');

        /* เลือกวันเอง */
        await p.click('#navPerBox [data-pcus]'); await p.waitForTimeout(250);
        if (!await p.$('#navPerBox [data-pf]')) bad(tag + ' [ข้อ2]: กด "กำหนดเอง" แล้วไม่มีช่องเลือกวัน');
        await p.evaluate(() => { $('#navPerBox [data-pf]').value = addDays(curDate(), -45);
          $('#navPerBox [data-pt]').value = addDays(curDate(), -10); $('#navPerBox [data-pf]').onchange(); });
        await p.waitForTimeout(350);
        const cus = await p.evaluate(() => ({ p: dPeriod(),
          inRange: dSales().every(s => s.soldAt >= dPeriod().from && s.soldAt <= dPeriod().to),
          quickOff: [...document.querySelectorAll('#navPerBox [data-pr]')].every(x => !x.classList.contains('on')),
          customOn: document.querySelector('#navPerBox [data-pcus]').classList.contains('on'),
          label: document.querySelector('#dPeriod').textContent }));
        if (!cus.p.custom)  bad(tag + ' [ข้อ2]: เลือกวันเองแล้วไม่ถือเป็นช่วงกำหนดเอง');
        if (!cus.inRange)   bad(tag + ' [ข้อ2]: ช่วงกำหนดเองแล้วยังมีการขายนอกช่วงปนมา');
        if (!cus.quickOff)  bad(tag + ' [ข้อ2]: เลือกวันเองแล้วปุ่มลัดยังไฮไลต์ค้าง');
        if (!cus.customOn)  bad(tag + ' [ข้อ2]: ปุ่ม "กำหนดเอง" ไม่ไฮไลต์');
        if (!cus.label.trim()) bad(tag + ' [ข้อ2]: ไม่มีบรรทัดบอกว่ากำลังดูช่วงไหน');

        /* กรอกกลับด้านต้องสลับให้ ไม่ใช่ได้ช่วงว่าง */
        await p.evaluate(() => { $('#navPerBox [data-pf]').value = addDays(curDate(), -5);
          $('#navPerBox [data-pt]').value = addDays(curDate(), -20); $('#navPerBox [data-pt]').onchange(); });
        await p.waitForTimeout(300);
        const sw = await p.evaluate(() => dPeriod());
        if (sw.from > sw.to) bad(tag + ' [ข้อ2]: กรอกวันกลับด้านแล้วไม่สลับให้');

        /* ส่งออกและพิมพ์ต้องเคารพช่วงที่เลือก */
        const exp = await p.evaluate(() => {
          let cap = null; const real = window.URL.createObjectURL;
          window.URL.createObjectURL = bl => { cap = bl; return 'blob:x'; };
          document.querySelector('#expSales').click();
          window.URL.createObjectURL = real;
          return cap ? cap.size > 0 : null; });
        if (exp === null) bad(tag + ' [ข้อ2]: กดส่งออกแล้วไม่มีไฟล์ออกมา');
        const rows = await p.evaluate(() => dSales().length);
        if (rows === undefined) bad(tag + ' [ข้อ2]: dSales() ใช้ไม่ได้');
        await p.click('#dPrint'); await p.waitForTimeout(400);
        if (!await p.evaluate(() => window.__pr)) bad(tag + ' [ข้อ2]: กดพิมพ์สรุปแล้วไม่พิมพ์');

        /* ล้างแล้วกลับไปใช้ปุ่มลัด — ที่ 390 การกดปุ่มบนหน้า (เช่น #dPrint) ปิดแผ่นไปแล้ว
           (pointerdown นอกแผ่น = ปิด ตามดีไซน์) ต้องเปิดใหม่ก่อน */
        if (W === 390) { await p.click('#npBtn'); await p.waitForTimeout(250); }
        await p.click('#navPerBox [data-pclr]'); await p.waitForTimeout(300);
        if (await p.evaluate(() => dPeriod().custom)) bad(tag + ' [ข้อ2]: กดล้างแล้วยังเป็นช่วงกำหนดเอง');
      }
      await ctx.close();
    }
  }

  console.log(fails.length ? 'FAILS:\n' + [...new Set(fails)].join('\n') : 'ALL_CHECKS_PASS');
  console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})();
