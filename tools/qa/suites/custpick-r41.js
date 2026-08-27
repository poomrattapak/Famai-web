/* ด่าน v1.41 — เลือกลูกค้าเดิมจากแผงในหน้าขาย (คำสั่งเจ้าของ 26 ส.ค. 2569:
   "ส่วนข้อมูลลูกค้าในหน้าขายรถ ให้เลือกลูกค้าจากที่เคยเพิ่มอยู่ได้ — ส่วนที่มีข้อมูลแล้ว
   ไม่ต้องกรอกเพิ่ม กรอกเฉพาะส่วนที่ยังไม่มี — ถ้าไม่มีลูกค้า ให้เพิ่มลูกค้าได้")
   ล็อก:
   [1] แตะ #sCust ว่าง → #sSugN โชว์ลูกค้า inScope เรียงอัปเดตล่าสุดก่อน cap 8 · focus ไม่ล้าง sCustSel
   [2] แตะ #sPhone ว่าง → #sSugP zero-state เดียวกัน
   [3] เลือกลูกค้าที่มี วันเกิด/เลขบัตร/ที่อยู่ → ทุกช่องถูกเติม + sCustSel ตั้ง + แผงปิด
   [4] สิทธิ์ (ท้ายไฟล์ — มีบันทึกขายจริง): role ไม่มี data:idNo เลือกลูกค้ามีเลขบัตร →
       #sIdNo.value ว่าง + placeholder ปิดกลาง · saveSale จริงแล้ว c.idNo เดิมไม่โดนทับ
   [5] เลือกคนมีเลขบัตร (มาสก์) แล้วเลือกคนไม่มีต่อ → placeholder กลับ default
   [6] พิมพ์ ≥2 ตัว → กรองชื่อ/เบอร์แบบเดิม + การพิมพ์ล้าง sCustSel (ยังไม่ยืนยันตัวตน)
   [7] blur → แผงปิดเอง
   [8] + เพิ่มลูกค้าใหม่ → กรอกครบในโมดัล → ฟอร์มขายได้ วันเกิด/เลขบัตร/ที่อยู่ ตามมาด้วย
   [9] ล้างฟอร์ม (#sReset) → ทุกช่องว่าง + placeholder กลับ default + sCustSel ว่าง
   [10] เปิดการขายจากใบจอง: #sCust = ชื่อบนใบจอง (สัญญาเดิม booking-r37) + ช่องเสริมเติมจากระเบียนลูกค้า */
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
  await p.evaluate(() => go('sell')); await p.waitForTimeout(250);

  /* ตัวเรียง zero-state — mirror จากแอป ใช้ร่วมหลายข้อ */
  const RECENT = `CUSTOMERS.filter(c=>inScope(c.branch)).slice()
    .sort((a,b)=>String(b.upAt||b.createdAt||'').localeCompare(String(a.upAt||a.createdAt||''))).slice(0,8)`;

  /* ---------- [1] แตะช่องชื่อว่าง → ลูกค้าล่าสุดขึ้นให้เลือก ---------- */
  await p.evaluate(() => { sCustSel = 'QA-KEEP'; });   /* let binding — ห้ามผ่าน window */
  await p.click('#sCust'); await p.waitForTimeout(150);
  const g1 = await p.evaluate(want => {
    const box = document.getElementById('sSugN');
    const rows = [...box.querySelectorAll('.si')];
    return { open: box.style.display !== 'none',
      got: rows.map(r => r.dataset.c).join(','),
      want: eval(want).map(c => c.id).join(','),
      hasPill: rows.every(r => r.querySelector('.pill')),
      sel: sCustSel };
  }, RECENT);
  if (!g1.open) bad('[1] แตะช่องชื่อว่างแล้วแผงไม่เปิด');
  else {
    if (g1.got !== g1.want) bad('[1] รายชื่อไม่ใช่ลูกค้าล่าสุด 8 คนแรก ได้ [' + g1.got + '] ควร [' + g1.want + ']');
    if (!g1.hasPill) bad('[1] แถวลูกค้าไม่มีป้ายสถานะ (ข้อความ+จุดสี)');
  }
  if (g1.sel !== 'QA-KEEP') bad('[1] แค่ focus ก็ล้าง sCustSel แล้ว (ต้องล้างเฉพาะตอนพิมพ์)');
  await p.evaluate(() => { sCustSel = ''; });

  /* ---------- [2] แตะช่องเบอร์ว่าง → zero-state เดียวกัน ---------- */
  await p.click('#sPhone'); await p.waitForTimeout(150);
  const g2 = await p.evaluate(() => ({
    open: document.getElementById('sSugP').style.display !== 'none',
    n: document.querySelectorAll('#sSugP .si').length }));
  if (!g2.open || !g2.n) bad('[2] แตะช่องเบอร์ว่างแล้วแผงไม่เปิด');

  /* ---------- [6] พิมพ์แล้วกรอง + ล้าง sCustSel ---------- */
  const g6 = await p.evaluate(() => {
    const c0 = CUSTOMERS.find(c => inScope(c.branch) && c.name.length >= 3);
    if (!c0) return { skip: true };
    const q = c0.name.slice(0, 2).toLowerCase();
    sCustSel = 'QA-KEEP';
    const el = $('#sCust'); el.value = q; el.oninput();
    const rows = [...document.querySelectorAll('#sSugN .si')];
    const ids = rows.map(r => r.dataset.c);
    const wrong = ids.filter(id => { const c = CUSTOMERS.find(x => x.id === id);
      return c.name.toLowerCase().indexOf(q) < 0; }).length;
    const r = { skip: false, q, n: rows.length, wrong, sel: sCustSel, hasC0: ids.indexOf(c0.id) >= 0 };
    el.value = ''; sCustSel = ''; rSell();
    return r;
  });
  if (g6.skip) bad('[6] seed ไม่มีลูกค้าชื่อยาวพอ');
  else {
    if (g6.sel !== '') bad('[6] พิมพ์แล้ว sCustSel ไม่ถูกล้าง — แก้ข้อความต้องถือว่ายังไม่ยืนยันตัวตน');
    if (!g6.n || !g6.hasC0) bad('[6] พิมพ์ "' + g6.q + '" แล้วไม่เจอลูกค้าที่ชื่อขึ้นต้นแบบนั้น');
    if (g6.wrong) bad('[6] มี ' + g6.wrong + ' แถวที่ชื่อไม่แมตช์คำค้น (กรองไม่ทำงาน)');
  }

  /* ---------- [7] blur → แผงปิด ---------- */
  await p.click('#sCust'); await p.waitForTimeout(150);
  await p.evaluate(() => document.getElementById('sCust').blur());
  await p.waitForTimeout(300);
  const g7 = await p.evaluate(() =>
    document.getElementById('sSugN').style.display === 'none' &&
    document.getElementById('sSugP').style.display === 'none');
  if (!g7) bad('[7] blur แล้วแผงไม่ปิด');

  /* ---------- [3] เลือกลูกค้าที่มีข้อมูลครบ → เติมทุกช่อง ---------- */
  const prep3 = await p.evaluate(want => {
    const c = eval(want)[0]; if (!c) return null;
    window.QA_KEEP3 = { id: c.id, birth: c.birth, idNo: c.idNo, addr: c.addr };
    c.birth = '2000-01-31'; c.idNo = '9-8765-43210-98-7'; c.addr = '99/9 หมู่ 1 ต.ทดสอบ';
    return c.id;
  }, RECENT);
  if (!prep3) bad('[3] ไม่มีลูกค้าให้ทดสอบ');
  else {
    await p.click('#sCust'); await p.waitForTimeout(150);
    const g3 = await p.evaluate(id => {
      const row = document.querySelector('#sSugN .si[data-c="' + id + '"]');
      if (!row) return { noRow: true };
      row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      const c = CUSTOMERS.find(x => x.id === id);
      const r = { noRow: false, name: $('#sCust').value === c.name, phone: $('#sPhone').value === (c.phone || ''),
        birth: $('#sBirth').value, idNo: $('#sIdNo').value, addr: $('#sAddr').value,
        sel: sCustSel === id, closed: document.getElementById('sSugN').style.display === 'none' };
      const k = window.QA_KEEP3;                                     /* คืนระเบียน + ล้างฟอร์ม */
      if (k.birth === undefined) delete c.birth; else c.birth = k.birth;
      if (k.idNo === undefined) delete c.idNo; else c.idNo = k.idNo;
      if (k.addr === undefined) delete c.addr; else c.addr = k.addr;
      ['sCust', 'sPhone', 'sBirth', 'sIdNo', 'sAddr'].forEach(x => $('#' + x).value = '');
      sCustSel = ''; rSell();
      return r;
    }, prep3);
    if (g3.noRow) bad('[3] ไม่เจอแถวลูกค้าในแผง');
    else {
      if (!g3.name || !g3.phone) bad('[3] เลือกแล้วชื่อ/เบอร์ไม่ถูกเติม');
      if (g3.birth !== '2000-01-31') bad('[3] วันเกิดไม่ถูกเติม (ได้ "' + g3.birth + '")');
      if (g3.idNo !== '9-8765-43210-98-7') bad('[3] เลขบัตรไม่ถูกเติมทั้งที่มีสิทธิ์เห็น (ได้ "' + g3.idNo + '")');
      if (g3.addr !== '99/9 หมู่ 1 ต.ทดสอบ') bad('[3] ที่อยู่ไม่ถูกเติม (ได้ "' + g3.addr + '")');
      if (!g3.sel) bad('[3] sCustSel ไม่ถูกตั้งเป็นลูกค้าที่เลือก');
      if (!g3.closed) bad('[3] เลือกแล้วแผงไม่ปิด');
    }
  }

  /* ---------- [5] สลับจากคนมีเลขบัตร (มาสก์) ไปคนไม่มี → placeholder กลับ default ---------- */
  const g5 = await p.evaluate(want => {
    const list = eval(want); if (list.length < 2) return { skip: true };
    const a = list[0], b2 = list[1];
    const keep = { pa: {}, ai: a.idNo, bi: b2.idNo };
    myRoles().forEach(r => { keep.pa[r] = PERMS[r]['data:idNo']; PERMS[r]['data:idNo'] = 'none'; });
    a.idNo = '8877665544332'; delete b2.idNo;
    sCustFill(a);
    const el = $('#sIdNo');
    const masked = { v: el.value, ph: el.placeholder, want: idMask('8877665544332') };
    sCustFill(b2);
    const after = { v: el.value, ph: el.placeholder };
    myRoles().forEach(r => { PERMS[r]['data:idNo'] = keep.pa[r]; });
    if (keep.ai === undefined) delete a.idNo; else a.idNo = keep.ai;
    if (keep.bi === undefined) delete b2.idNo; else b2.idNo = keep.bi;
    ['sCust', 'sPhone', 'sBirth', 'sIdNo', 'sAddr'].forEach(x => $('#' + x).value = '');
    sCustSel = ''; rSell();
    return { skip: false, masked, after };
  }, RECENT);
  if (g5.skip) bad('[5] ลูกค้าใน scope ไม่พอสองคน');
  else {
    if (g5.masked.v !== '' || g5.masked.ph !== g5.masked.want)
      bad('[5] คนมีเลขบัตร: ควรได้ value ว่าง + placeholder "' + g5.masked.want + '" (ได้ "' + g5.masked.v + '"/"' + g5.masked.ph + '")');
    if (g5.after.ph !== '1-2345-67890-12-3' || g5.after.v !== '')
      bad('[5] สลับไปคนไม่มีเลขบัตรแล้ว placeholder ไม่กลับ default (ได้ "' + g5.after.ph + '")');
  }

  /* ---------- [9] ล้างฟอร์มแล้ว placeholder กลับ default ---------- */
  const g9 = await p.evaluate(want => {
    const a = eval(want)[0]; if (!a) return { skip: true };
    const keep = { pa: {}, ai: a.idNo };
    myRoles().forEach(r => { keep.pa[r] = PERMS[r]['data:idNo']; PERMS[r]['data:idNo'] = 'none'; });
    a.idNo = '8877665544332';
    sCustFill(a);
    $('#sReset').onclick();
    const r = { skip: false, ph: $('#sIdNo').placeholder, v: $('#sIdNo').value,
      name: $('#sCust').value, sel: sCustSel };
    myRoles().forEach(r2 => { PERMS[r2]['data:idNo'] = keep.pa[r2]; });
    if (keep.ai === undefined) delete a.idNo; else a.idNo = keep.ai;
    return r;
  }, RECENT);
  if (!g9.skip) {
    if (g9.ph !== '1-2345-67890-12-3') bad('[9] ล้างฟอร์มแล้ว placeholder เลขบัตรไม่กลับ default (ได้ "' + g9.ph + '")');
    if (g9.v !== '' || g9.name !== '' || g9.sel !== '') bad('[9] ล้างฟอร์มแล้วช่อง/sCustSel ไม่ว่าง');
  }

  /* ---------- [8] เพิ่มลูกค้าใหม่ → ข้อมูลจากโมดัลตามมาลงฟอร์มขาย ---------- */
  await p.click('#sNewCust'); await p.waitForTimeout(300);
  await p.evaluate(() => { $('#cmName').value = 'QA ลูกค้า R41'; $('#cmPhone').value = '081-000-4141'; });
  await p.click('#cmMoreBtn'); await p.waitForTimeout(150);
  await p.evaluate(() => { $('#cmBirth').value = '1999-12-31';
    $('#cmIdNo').value = '1-1111-11111-11-1'; $('#cmAddr').value = '11 ถ.ทดสอบ'; });
  await p.click('#cmGo'); await p.waitForTimeout(300);
  const g8 = await p.evaluate(() => {
    const r = { name: $('#sCust').value, birth: $('#sBirth').value, idNo: $('#sIdNo').value,
      addr: $('#sAddr').value, sel: sCustSel };
    const i = CUSTOMERS.findIndex(c => c.name === 'QA ลูกค้า R41');      /* ลบลูกค้า QA ทิ้ง */
    if (i >= 0) CUSTOMERS.splice(i, 1);
    ['sCust', 'sPhone', 'sBirth', 'sIdNo', 'sAddr'].forEach(x => $('#' + x).value = '');
    sCustSel = ''; rSell();
    return r;
  });
  if (g8.name !== 'QA ลูกค้า R41' || !g8.sel) bad('[8] เพิ่มลูกค้าใหม่แล้วชื่อ/sCustSel ไม่ถูกตั้งในฟอร์มขาย');
  if (g8.birth !== '1999-12-31' || g8.idNo !== '1-1111-11111-11-1' || g8.addr !== '11 ถ.ทดสอบ')
    bad('[8] ข้อมูลที่กรอกในโมดัลไม่ตามมาลงฟอร์มขาย (ได้ ' + g8.birth + '/' + g8.idNo + '/' + g8.addr + ') — ต้องกรอกซ้ำ');

  /* ---------- [10] เปิดการขายจากใบจอง — ชื่อจากใบจอง + ช่องเสริมจากระเบียนลูกค้า ---------- */
  const g10 = await p.evaluate(() => {
    const bk = BOOKINGS.find(x => x.status === 'จองอยู่' && x.custId && CUSTOMERS.some(c => c.id === x.custId));
    if (!bk) return { skip: true };
    const c = CUSTOMERS.find(x => x.id === bk.custId);
    const keep = { birth: c.birth, addr: c.addr };
    c.birth = '1995-05-05'; c.addr = 'ที่อยู่จากระเบียน 10';
    bookOpenSale(bk.id);
    const r = { skip: false, name: $('#sCust').value, wantName: bk.name,
      birth: $('#sBirth').value, addr: $('#sAddr').value, sel: sCustSel === bk.custId };
    if (keep.birth === undefined) delete c.birth; else c.birth = keep.birth;
    if (keep.addr === undefined) delete c.addr; else c.addr = keep.addr;
    ['sCust', 'sPhone', 'sBirth', 'sIdNo', 'sAddr'].forEach(x => $('#' + x).value = '');
    sCustSel = ''; rSell();
    return r;
  });
  if (g10.skip) bad('[10] seed ไม่มีใบจองที่ผูกลูกค้า');
  else {
    if (g10.name !== g10.wantName) bad('[10] #sCust ต้องเป็นชื่อบนใบจอง (สัญญา booking-r37) ได้ "' + g10.name + '"');
    if (g10.birth !== '1995-05-05' || g10.addr !== 'ที่อยู่จากระเบียน 10')
      bad('[10] ช่องเสริมไม่ถูกเติมจากระเบียนลูกค้าของใบจอง (ได้ ' + g10.birth + '/' + g10.addr + ')');
    if (!g10.sel) bad('[10] sCustSel ไม่ตรง custId ของใบจอง');
  }

  /* ---------- [4] สิทธิ์เลขบัตร + saveSale จริง (ท้ายไฟล์ — มีผลข้างเคียงขายจริง) ---------- */
  const prep4 = await p.evaluate(want => {
    const c = eval(want)[0]; if (!c) return null;
    window.QA_KEEP4 = { id: c.id, idNo: c.idNo, pa: {} };
    myRoles().forEach(r => { window.QA_KEEP4.pa[r] = PERMS[r]['data:idNo']; PERMS[r]['data:idNo'] = 'none'; });
    c.idNo = '8877665544332';
    return { id: c.id, mask: idMask('8877665544332') };
  }, RECENT);
  if (!prep4) bad('[4] ไม่มีลูกค้าให้ทดสอบ');
  else {
    await p.click('#sCust'); await p.waitForTimeout(150);
    const g4a = await p.evaluate(id => {
      const row = document.querySelector('#sSugN .si[data-c="' + id + '"]');
      if (!row) return { noRow: true };
      row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      return { noRow: false, v: $('#sIdNo').value, ph: $('#sIdNo').placeholder };
    }, prep4.id);
    if (g4a.noRow) bad('[4] ไม่เจอแถวลูกค้าในแผง');
    else {
      if (g4a.v !== '') bad('[4] ไม่มีสิทธิ์เห็นเลขบัตร แต่ value ถูกเติม ("' + g4a.v + '") — เลขจริง/มาสก์จะถูกบันทึกทับ');
      if (g4a.ph !== prep4.mask) bad('[4] placeholder ไม่ใช่เลขปิดกลาง (ได้ "' + g4a.ph + '")');
      const g4b = await p.evaluate(() => {
        /* [10] ทิ้งคันติดจองค้างใน #sUnit — เลือกคันว่างจริงก่อน ไม่งั้นด่านจองใน saveSale กันไว้ (ถูกแล้ว) */
        const u = sellPool().find(x => x.status === 'available'); if (u) sUnitSet(u.id);
        saveSale(false); return !!document.getElementById('cfmGo'); });
      if (!g4b) bad('[4] saveSale ไม่เปิดกล่องยืนยัน — เคสทดสอบไม่เดินต่อ');
      else {
        await p.evaluate(() => { $('#cfmGo').onclick(); });
        await p.waitForTimeout(300);
        const g4c = await p.evaluate(() => {
          const k = window.QA_KEEP4;
          const c = CUSTOMERS.find(x => x.id === k.id);
          const r = { idNo: c ? c.idNo : '(หาย)' };
          myRoles().forEach(r2 => { PERMS[r2]['data:idNo'] = k.pa[r2]; });
          if (k.idNo === undefined) delete c.idNo; else c.idNo = k.idNo;
          return r;
        });
        if (g4c.idNo !== '8877665544332')
          bad('[4] บันทึกขายแล้วเลขบัตรเดิมโดนทับเป็น "' + g4c.idNo + '" — placeholder หลุดไปเป็นค่าจริง');
      }
    }
  }

  await b.close();
  if (errors.length) fails.push(...errors);
  if (fails.length) { console.log('FAILS:'); fails.forEach(f => console.log(f)); process.exit(1); }
  console.log('ALL_CHECKS_PASS (custpick-r41: 10 ข้อ)');
})().catch(e => { console.error('SUITE_CRASH', e); process.exit(2); });
