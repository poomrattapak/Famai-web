/* รากฐานรอบ 16 — 4 อย่างที่ทุกกลุ่มงานถัดไปพึ่ง
   1) ด่านโอนย้าย (O1): เซลล์เรียกตัวบันทึกตรง ๆ ต้องถูกปฏิเสธ — ยิงที่ฟังก์ชัน ไม่ใช่ดูปุ่ม (§9b)
   2) สรุปดีล recompute (O3): เงินดาวน์/งวด/ไฟแนนซ์ ต้องผูกกับ calcSell
   3) toast ใหม่: สามโทน ไอคอนถูกตัว และผู้เรียกเดิม (bad=1) ยังได้โทนแดง
   4) confirmSave: โชว์ข้อมูลจริง แถวว่างถูกตัด กดยืนยันแล้ว callback ทำงาน กดกลับไม่ทำงาน */
const { chromium, EXE, BASE } = require('./env');

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const fails = [];
  const errs = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', e => errs.push(e.message));

  const login = async id => {
    await page.goto(BASE + '/index.html');
    await page.click(`#lgUsers [data-id="${id}"]`);
    await page.click('#lgGo');
    await page.waitForTimeout(350);
  };

  /* ---- 1) ด่านโอนย้าย — บทบาทเซลล์ ---- */
  await login('ST3');                                    /* sales */
  const t1 = await page.evaluate(() => {
    /* จำลองคนที่เรียกฟังก์ชันผ่านคอนโซล: บังคับวาดหน้าโอนย้ายเองแล้วกดบันทึกตรง ๆ */
    rTransfer();
    const u = UNITS.find(x => x.status === 'available');
    if (u) $('#tUnit').value = u.id;
    $('#tTo').value = BRANCHES.find(b => b.code !== (u && u.branch)).code;
    const before = TRANSFERS.length;
    $('#tSave').onclick();
    /* ถ้าด่านหลุด confirmSave จะเปิด — กดยืนยันซ้ำเพื่อพิสูจน์ให้สุดทาง */
    const go = $('#cfmGo'); if (go && $('#modal').classList.contains('on')) go.onclick();
    return { before, after: TRANSFERS.length, canT: canTransfer() };
  });
  if (t1.canT) fails.push('canTransfer() คืน true สำหรับบทบาทเซลล์');
  if (t1.after !== t1.before) fails.push('เซลล์กดบันทึกโอนย้ายตรง ๆ แล้ว TRANSFERS โตขึ้น — ด่าน §9b หลุด');

  /* ---- ฝั่งรับ: เซลล์กดยืนยันรับตรง ๆ ต้องไม่ได้ ---- */
  const t1b = await page.evaluate(() => {
    const t = TRANSFERS.find(x => x.status !== 'รับแล้ว');
    if (!t) return { skip: true };
    const u = UNITS.find(x => x.id === t.unitId);
    const wasBranch = u && u.branch;
    document.querySelector(`[data-tr="${t.id}"]`)?.onclick?.();
    /* ไม่มีปุ่มก็เรียก handler แบบเดียวกับ attacker: สร้างเองไม่ได้ จึงตรวจสถานะแทน */
    return { skip: false, status: t.status, moved: u && u.branch !== wasBranch };
  });
  if (!t1b.skip && (t1b.status === 'รับแล้ว' || t1b.moved))
    fails.push('เซลล์ยืนยันรับโอนย้ายได้ — ด่านฝั่งรับหลุด');

  /* ---- 2) O3: ช่องเงินผูกกับ calcSell ---- */
  await login('ST1');                                    /* admin */
  await page.evaluate(() => go('sell'));
  await page.waitForTimeout(250);
  const t2 = await page.evaluate(() => ({
    down: $('#sDown').oninput === calcSell,
    term: $('#sTerm').onchange === calcSell,
    fin:  $('#sFinCo').onchange === calcSell,
    disc: $('#sDisc').oninput === calcSell
  }));
  Object.entries(t2).forEach(([k, ok]) => { if (!ok) fails.push(`ช่อง ${k} ไม่ได้ผูกกับ calcSell — สรุปดีลจะนิ่งเมื่อแก้ค่า`); });

  /* ---- 3) toast สามโทน ---- */
  const t3 = await page.evaluate(() => {
    const read = () => { const t = document.querySelector('#toasts .toast:last-child');
      const r = { cls: t.className, ic: t.querySelector('.ti').textContent }; t.remove(); return r; };
    toast('สำเร็จ', 'x');        const ok = read();
    toast('พัง', 'x', 1);        const bad = read();
    toast('เตือน', 'x', 'warn'); const warn = read();
    return { ok, bad, warn };
  });
  if (t3.ok.cls !== 'toast' || t3.ok.ic !== '✓') fails.push('toast สำเร็จไม่ใช่โทนเขียว ✓: ' + JSON.stringify(t3.ok));
  if (!/\bbad\b/.test(t3.bad.cls) || t3.bad.ic !== '✕') fails.push('toast(bad=1) ไม่ได้โทนแดง ✕ — ผู้เรียกเดิมพัง');
  if (!/\bwarn\b/.test(t3.warn.cls) || t3.warn.ic !== '!') fails.push('toast warn ไม่ได้โทนเหลือง !');

  /* ---- 4) confirmSave ---- */
  const t4 = await page.evaluate(() => {
    let ran = 0;
    confirmSave('ทดสอบ', [['รุ่น', 'NMAX'], ['ว่าง', ''], ['ราคา', '89,500 ฿']], () => ran++);
    const body = $('#mdB').innerHTML;
    const shown = body.indexOf('NMAX') >= 0 && body.indexOf('89,500') >= 0;
    const emptyCut = body.indexOf('ว่าง') < 0;
    $('#cfmNo').onclick();
    const afterNo = ran;
    confirmSave('ทดสอบ', [['ก', 'ข']], () => ran++);
    $('#cfmGo').onclick();
    return { shown, emptyCut, afterNo, ran, closed: !$('#modal').classList.contains('on') };
  });
  if (!t4.shown) fails.push('confirmSave ไม่โชว์ข้อมูลที่กรอกจริง');
  if (!t4.emptyCut) fails.push('confirmSave ไม่ตัดแถวค่าว่าง');
  if (t4.afterNo !== 0) fails.push('กด "กลับไปแก้" แล้ว callback ยังทำงาน');
  if (t4.ran !== 1) fails.push('กดยืนยันแล้ว callback ไม่ทำงาน (ran=' + t4.ran + ')');
  if (!t4.closed) fails.push('ยืนยันแล้ว modal ไม่ปิด');

  console.log(fails.length ? 'FAILS:\n' + fails.join('\n') : 'ALL_CHECKS_PASS');
  console.log(errs.length ? 'ERRORS:\n' + [...new Set(errs)].join('\n') : 'NO_PAGE_ERRORS');
  await browser.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})();
