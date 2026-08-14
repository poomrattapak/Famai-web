/* ด่านศูนย์แจ้งเตือน (บรีฟรอบ 1 · J1-J2)
   หลักที่คุม: รายการคิดสดจากระเบียนจริง (กฎข้อ 8) · สิทธิ์/ขอบเขตเท่าหน้าจริง ไม่รั่วข้ามบทบาท ·
   อ่านแล้วนับศูนย์ต่อคน · ปิดหมวดได้ (J2) · สรุปประจำวันเฉพาะผู้บริหาร · ช่องทางนอกแอปเป็นโครง (J1) */
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

  /* 1 · แอดมิน: มีงานค้างจาก seed → กระดิ่งขึ้นเลข · เปิดดูแล้วนับศูนย์ · ระเบียนใหม่ → เด้งกลับมา */
  const t1 = await p.evaluate(() => {
    const n0 = notifItems().length;
    const bell0 = $('#bellN').textContent;
    notifOpen();
    const drawerOpen = $('#drw').classList.contains('on');
    const hasDigest = $('#drwB').innerHTML.includes('สรุปวันนี้');
    const hasChannels = $('#drwB').innerHTML.includes('LINE') && $('#drwB').innerHTML.includes('ยังไม่เปิดใช้');
    closeDrawer(); notifSync();
    const afterOpen = $('#bellN').style.display === 'none';
    /* ใบลาใหม่ = ระเบียนจริงใหม่ → ต้องเด้งโดยไม่ต้องมีใคร "สร้างแจ้งเตือน" */
    LEAVES.push({ id: 'LVN1', staffId: 'ST6', type: 'ลากิจ', from: addDays(curDate(), 5),
      to: addDays(curDate(), 5), status: 'รออนุมัติ' });
    notifSync();
    const reNotified = $('#bellN').style.display !== 'none';
    return { n0, bell0, drawerOpen, hasDigest, hasChannels, afterOpen, reNotified };
  });
  if (!(t1.n0 > 0))     bad('แอดมินไม่มีรายการแจ้งเตือนทั้งที่ seed มีงานค้าง');
  if (+t1.bell0 !== t1.n0) bad('เลขบนกระดิ่ง (' + t1.bell0 + ') ไม่ตรงจำนวนงานค้าง (' + t1.n0 + ')');
  if (!t1.drawerOpen)   bad('กดกระดิ่งแล้วแผ่นแจ้งเตือนไม่เปิด');
  if (!t1.hasDigest)    bad('ผู้บริหารไม่เห็นสรุปประจำวัน (J2)');
  if (!t1.hasChannels)  bad('ไม่มีโครงช่องทางอีเมล/LINE ที่บอกว่ายังไม่เปิดใช้ (J1)');
  if (!t1.afterOpen)    bad('เปิดอ่านแล้วเลขบนกระดิ่งไม่กลับเป็นศูนย์');
  if (!t1.reNotified)   bad('มีระเบียนค้างใหม่แล้วกระดิ่งไม่เด้งกลับมา (ต้องคิดสดจากระเบียน)');

  /* 2 · ปิดหมวด (J2) — หมวดที่ปิดหายทั้งจากรายการและตัวนับ · เปิดคืนแล้วกลับมา */
  const t2 = await p.evaluate(() => {
    const withHr = notifItems().some(x => x.k === 'hr');
    const nt = ntfLoad(); nt.mute.hr = true; ntfSave(nt);
    const muted = !notifItems().some(x => x.k === 'hr');
    const nt2 = ntfLoad(); nt2.mute.hr = false; ntfSave(nt2);
    const back = notifItems().some(x => x.k === 'hr');
    return { withHr, muted, back };
  });
  if (!t2.withHr) bad('ไม่มีรายการหมวดพนักงานทั้งที่มีใบลารออนุมัติ');
  if (!t2.muted)  bad('ปิดหมวดแล้วรายการหมวดนั้นยังโผล่');
  if (!t2.back)   bad('เปิดหมวดคืนแล้วรายการไม่กลับมา');

  /* 3 · กดรายการแล้วพาไปหน้างานจริง + แผ่นปิด */
  const t3 = await p.evaluate(() => {
    go('dash'); notifOpen();
    const row = $('#drwB [data-ngo]'); if (!row) return { skip: 'ไม่มีรายการให้กด' };
    const dest = row.dataset.ngo;
    row.onclick();
    return { went: CUR === dest, closed: !$('#drw').classList.contains('on') };
  });
  if (t3.skip) bad('ข้ามการกดรายการ: ' + t3.skip);
  else {
    if (!t3.went)   bad('กดรายการแล้วไม่พาไปหน้างาน');
    if (!t3.closed) bad('กดรายการแล้วแผ่นไม่ปิด');
  }
  await p.close();

  /* 4 · เซลล์: ขอบเขตต้องเท่าหน้าจริง — ห้ามเห็นงานตรวจการเงิน/HR ของคนอื่น · ไม่มีสรุปผู้บริหาร */
  const p2 = await ctx.newPage();
  p2.on('pageerror', e => errors.push('S PAGEERROR ' + e.message));
  await login(p2, 'ST3');
  const t4 = await p2.evaluate(() => {
    const items = notifItems();
    const leakFin = items.some(x => x.id.startsWith('fap:'));
    const leakHr  = items.some(x => x.id.startsWith('lv:') || x.id.startsWith('of:') || x.id.startsWith('attq:'));
    const leakAr  = items.some(x => x.k === 'ar') && !canSee('ar');
    notifOpen();
    const noDigest = !$('#drwB').innerHTML.includes('สรุปวันนี้');
    closeDrawer();
    /* ใบลาของตัวเองที่ถูกตัดสิน — ต้องเห็น (แจ้งผลกลับหาเจ้าของใบ) */
    LEAVES.push({ id: 'LVS1', staffId: ME.id, type: 'ลากิจ', from: curDate(), to: curDate(),
      status: 'ไม่อนุมัติ', decidedBy: 'คุณจอย', decidedAt: curDate(), decideNote: 'ช่วงนั้นงานแน่น' });
    const own = notifItems().some(x => x.id.startsWith('lvd:LVS1'));
    return { leakFin, leakHr, leakAr, noDigest, own };
  });
  if (t4.leakFin)  bad('[sales] เห็นงานตรวจการเงิน (ไม่มีสิทธิ์)');
  if (t4.leakHr)   bad('[sales] เห็นใบลา/คำขอ/คิวตรวจของคนอื่น');
  if (t4.leakAr)   bad('[sales] เห็นเงินค้างรับทั้งที่ไม่เห็นหน้านั้น');
  if (!t4.noDigest) bad('[sales] เห็นสรุปประจำวันของผู้บริหาร');
  if (!t4.own)     bad('[sales] ไม่เห็นผลตัดสินใบลาของตัวเอง');
  await p2.close();

  console.log(fails.length ? 'FAILS:\n' + [...new Set(fails)].join('\n') : 'ALL_CHECKS_PASS');
  console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})();
