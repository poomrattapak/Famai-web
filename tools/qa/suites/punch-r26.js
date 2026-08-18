/* ด่านของการแก้บั๊กลงเวลา v1.26 ข้อ 5 — "deploy ทีไรระบบลงชื่อเข้าให้เอง"
   ต้นตอคือ seed สาธิตใส่เวลาเข้าของวันนี้ให้ทุกคนตอนเปิดแอป ไม่ใช่ auto-punch
   กติกาใหม่: วันนี้เริ่มว่างเสมอ · กดเข้าซ้ำ/ออกก่อนเข้า/ออกซ้ำ ต้องโดนด่านใน punch()
   และเจ้าตัวต้องถูกเตือนเมื่อวันก่อนลืมลงเวลาออก — ทุกข้อพิสูจน์ mutation แล้ว */
const { chromium, EXE, BASE } = require('./env');

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const fails = [], errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await p.goto(BASE + '/index.html');
  await p.click('#lgGo'); await p.waitForTimeout(400);

  /* 1 · seed ของวันนี้ต้องว่างทุกคน (แถวยังอยู่ แต่ in/out เป็น null) */
  const seed = await p.evaluate(() => {
    const today = ATT.filter(a => a.date === curDate());
    return { workday: isWorkDay(curDate()), cnt: today.length,
      dirty: today.filter(a => a.in != null || a.out != null).map(a => a.staffId) };
  });
  if (seed.workday && !seed.cnt) fails.push('[1] วันทำงานแต่ seed ไม่มีแถวของวันนี้เลย (ห้ามลบแถว — att-r4 นับวันจากแถว)');
  if (seed.dirty.length) fails.push('[1] seed วันนี้ยังมีเวลาเข้า/ออกของ: ' + seed.dirty.join(',') + ' — การ์ดจะขึ้น "เข้างานแล้ว" เองอีก');

  /* 2 · เปิดแอปแล้วการ์ดต้องรอให้กดเอง ไม่ใช่ "เข้างานแล้ว" */
  const card = await p.textContent('#punchBody');
  if (!await p.$('#pcIn')) fails.push('[2] เปิดแอปแล้วไม่มีปุ่มลงเวลาเข้า');
  if (!card.includes('ยังไม่ได้ลงเวลาเข้า')) fails.push('[2] การ์ดไม่ได้บอก "ยังไม่ได้ลงเวลาเข้า" — ได้: ' + card.slice(0, 80));
  if (card.includes('เข้างานแล้ว')) fails.push('[2] การ์ดขึ้น "เข้างานแล้ว" ทั้งที่ยังไม่มีใครกด');

  /* 3-5 · ด่านกันสถานะเพี้ยนใน punch() — เรียกฟังก์ชันตรง ไม่ผ่าน UI (§9b) */
  const g = await p.evaluate(() => {
    const out = {}, me = ME.id;
    const clear = () => { const i = ATT.findIndex(a => a.staffId === me && a.date === curDate());
      if (i >= 0) ATT.splice(i, 1); };
    const now = () => new Date().toISOString();
    const good = () => ({ photoId: 'PH_t26', photoAt: now(), geo: { lat: 13.75, lng: 100.5, acc: 12 }, geoAt: now() });

    /* ออกโดยไม่เคยเข้า */
    clear();
    out.outNoIn = punch(me, 'out', good());
    const r0 = attOf(me, curDate());
    out.outNoInWrote = !!(r0 && r0.out);

    /* เข้าซ้ำต้องไม่ทับเวลาเดิม */
    clear();
    out.in1 = punch(me, 'in', good());
    const inT = attOf(me, curDate()).in;
    out.in2 = punch(me, 'in', good());
    out.inKept = attOf(me, curDate()).in === inT;

    /* ออกซ้ำต้องไม่ทับเวลาเดิม */
    out.out1 = punch(me, 'out', good());
    const outT = attOf(me, curDate()).out;
    out.out2 = punch(me, 'out', good());
    out.outKept = attOf(me, curDate()).out === outT;
    return out;
  });
  if (g.outNoIn !== null) fails.push('[4] ลงเวลาออกได้ทั้งที่ยังไม่เคยลงเวลาเข้า');
  if (g.outNoInWrote)     fails.push('[4] ถูกด่านปฏิเสธแล้วแต่เวลาออกยังถูกเขียน');
  if (!g.in1)             fails.push('[3] ลงเวลาเข้าครั้งแรกไม่ผ่านทั้งที่หลักฐานครบ');
  if (g.in2 !== null)     fails.push('[3] กดเข้าซ้ำแล้ว punch() ไม่ปฏิเสธ');
  if (!g.inKept)          fails.push('[3] กดเข้าซ้ำแล้วเวลาเข้าเดิมถูกทับ');
  if (!g.out1)            fails.push('[5] ลงเวลาออกครั้งแรกไม่ผ่านทั้งที่ลงเวลาเข้าแล้ว');
  if (g.out2 !== null)    fails.push('[5] กดออกซ้ำแล้ว punch() ไม่ปฏิเสธ');
  if (!g.outKept)         fails.push('[5] กดออกซ้ำแล้วเวลาออกเดิมถูกทับ');

  /* 6 · วันก่อนลืมลงเวลาออก — เจ้าตัวต้องถูกเตือนทั้งบนการ์ดและในศูนย์แจ้งเตือน
     สร้างประวัติเองแบบ attflags-r13 ไม่พึ่งเรื่องเล่าใน seed */
  const w = await p.evaluate(() => {
    const me = ME.id, yd = addDays(curDate(), -1);
    const a = attEnsure(me, yd); a.in = '09:00:00'; a.out = null; a.status = '';
    const open = attOpenPast(me).map(x => x.date);
    const notif = notifItems().some(x => String(x.id).indexOf('openout:') === 0);
    rPunch();
    return { open, notif, cardWarn: document.querySelector('#punchBody').textContent.includes('ลืมลงเวลาออก') };
  });
  if (!w.open.length)  fails.push('[6] attOpenPast ไม่เห็นวันเมื่อวานที่เข้าแล้วไม่ออก');
  if (!w.notif)        fails.push('[6] notifItems ไม่มีรายการ openout: ทั้งที่เจ้าตัวมีวันค้าง');
  if (!w.cardWarn)     fails.push('[6] การ์ดลงเวลาไม่เตือน "ลืมลงเวลาออก" ให้เจ้าตัวเห็น');

  console.log(fails.length ? 'FAILS:\n' + fails.join('\n') : 'ALL_CHECKS_PASS');
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})();
