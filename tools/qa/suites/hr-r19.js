/* ด่านกลุ่ม ⑤ (บรีฟรอบ 1) — พนักงาน
   H3 โควตาวันลา custom · K10 ผู้ตัดสิน+เหตุผลตีกลับ · H6 หลักฐานย่อรูป · H4 ขอออกนอกสถานที่
   H5 ปฏิทินบริษัทเปิดทุกบทบาท+วันหยุด · K9 วันที่รับรถศูนย์ซ่อม · K13 ป้ายยอดชำระ · H1 ลงเวลาเข้าฐานข้อมูล
   หลักพิสูจน์: เรียกฟังก์ชันเขียนตรง ๆ ด้วยบทบาทต้องห้าม ไม่ใช่ดูปุ่ม (กฎ §9b) */
const { chromium, EXE, BASE } = require('./env');

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errors = [];
  const bad = m => fails.push(m);

  /* ---------- ฝั่งผู้ดูแล (แอดมิน ST1) ---------- */
  const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('A PAGEERROR ' + e.message));
  await p.goto(BASE + '/index.html');
  await p.click('#lgUsers [data-id="ST1"]'); await p.click('#lgGo'); await p.waitForTimeout(400);

  /* 1 · โควตา (H3): ประเภท custom + เพดานบังคับที่ #lvSave — เกินโควตาต้องไม่บันทึก */
  const t1 = await p.evaluate(() => {
    CFG.leaveQuota = 'ลาทดสอบ:2\nลาป่วย:30';
    go('hr'); rHr();
    $('#lvType').value = 'ลาทดสอบ';
    $('#lvWho').innerHTML = '<option value="' + ME.id + '">me</option>'; $('#lvWho').value = ME.id;
    $('#lvFrom').value = addDays(curDate(), 30); $('#lvTo').value = addDays(curDate(), 33);   /* 4 วัน > 2 */
    const n = LEAVES.length;
    $('#lvSave').onclick();
    const blocked = LEAVES.length === n;
    $('#lvTo').value = addDays(curDate(), 31);                                                /* 2 วัน = พอดีเพดาน */
    $('#lvSave').onclick();
    const saved = LEAVES.length === n + 1 && LEAVES[n].type === 'ลาทดสอบ';
    /* ยื่นเพิ่มอีก 1 วันประเภทเดิมปีเดียวกัน → เกินสะสม ต้องโดนบล็อก */
    $('#lvFrom').value = addDays(curDate(), 40); $('#lvTo').value = addDays(curDate(), 40);
    $('#lvSave').onclick();
    const cumBlocked = LEAVES.length === n + 1;
    const custom = [...$('#lvType').options].some(o => o.value === 'ลาทดสอบ');
    return { blocked, saved, cumBlocked, custom };
  });
  if (!t1.blocked)    bad('ยื่นลาเกินโควตาแล้วยังบันทึกได้ (H3)');
  if (!t1.saved)      bad('ยื่นลาในโควตาไม่ผ่าน (ด่านแรงเกินไป)');
  if (!t1.cumBlocked) bad('โควตาไม่นับสะสมรวมใบที่รออนุมัติ');
  if (!t1.custom)     bad('ประเภทลา custom จากตั้งค่าไม่โผล่ในตัวเลือก');

  /* 2 · ตัดสินใบลา (K10): ตีกลับไม่มีเหตุผล = ไม่ผ่าน · ตัดสินแล้วบันทึกใครกด */
  const t2 = await p.evaluate(() => {
    const l = LEAVES.find(x => x.id === 'LV1');                       /* ของ ST6 รออนุมัติ */
    const noNote = lvDecide('LV1', false) === false && l.status === 'รออนุมัติ';
    const withNote = lvDecide('LV1', false, 'ช่วงนั้นคนไม่พอ') === true
      && l.status === 'ไม่อนุมัติ' && l.decidedBy === ME.nick && l.decideNote === 'ช่วงนั้นคนไม่พอ';
    const ok2 = lvDecide('LV2', true) === true
      && LEAVES.find(x => x.id === 'LV2').status === 'อนุมัติแล้ว'
      && LEAVES.find(x => x.id === 'LV2').decidedBy === ME.nick;
    /* อนุมัติใบของตัวเองไม่ได้ */
    LEAVES.push({ id: 'LVME', staffId: ME.id, type: 'ลากิจ', from: addDays(curDate(), 50),
      to: addDays(curDate(), 50), status: 'รออนุมัติ' });
    const selfBlocked = lvDecide('LVME', true) === false
      && LEAVES.find(x => x.id === 'LVME').status === 'รออนุมัติ';
    return { noNote, withNote, ok2, selfBlocked };
  });
  if (!t2.noNote)      bad('ตีกลับใบลาโดยไม่บอกเหตุผลได้ (K10)');
  if (!t2.withNote)    bad('ตีกลับพร้อมเหตุผลไม่บันทึกผู้ตัดสิน/เหตุผล');
  if (!t2.ok2)         bad('อนุมัติใบลาไม่บันทึกผู้ตัดสิน');
  if (!t2.selfBlocked) bad('อนุมัติใบลาของตัวเองได้');

  /* 3 · ย่อรูปหลักฐาน (H6): ไฟล์ใหญ่ → dataURL jpeg ขนาดไม่เกิน 1000px */
  const t3 = await p.evaluate(async () => {
    const cv = document.createElement('canvas'); cv.width = 2400; cv.height = 1600;
    const g = cv.getContext('2d'); g.fillStyle = '#345'; g.fillRect(0, 0, 2400, 1600);
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    const d = await lvImgShrink(new File([blob], 'x.png', { type: 'image/png' }));
    if (!d || !d.startsWith('data:image/jpeg')) return { ok: false, why: 'ไม่ได้ jpeg' };
    const img = new Image(); img.src = d; await new Promise(r => { img.onload = r; });
    return { ok: img.width <= 1000 && img.height <= 1000 && Math.abs(img.width / img.height - 1.5) < .01,
      w: img.width, h: img.height };
  });
  if (!t3.ok) bad('ย่อรูปหลักฐานผิด (ได้ ' + (t3.w || '?') + '×' + (t3.h || '?') + ' หรือไม่ใช่ jpeg/สัดส่วนเพี้ยน)');

  /* 4 · ขอออกนอกสถานที่ (H4): ย้อนหลังไม่ได้ · ส่งแล้วเป็นของตัวเอง · ตัดสินแบบเดียวกับใบลา */
  const t4 = await p.evaluate(() => {
    go('hr');
    const n = OFFS.length;
    $('#ofDate').value = addDays(curDate(), -1); $('#ofPlace').value = 'ย้อนหลัง';
    $('#ofSave').onclick();
    const backBlocked = OFFS.length === n;
    $('#ofDate').value = addDays(curDate(), 3); $('#ofPlace').value = 'ไปงานไฟแนนซ์';
    $('#ofSave').onclick();
    const saved = OFFS.length === n + 1 && OFFS[n].staffId === ME.id && OFFS[n].status === 'รออนุมัติ';
    /* ตัดสินของ ST3 (OF1): ตีกลับไม่มีเหตุผลไม่ได้ · อนุมัติแล้วบันทึกใครกด */
    const noNote = ofDecide('OF1', false) === false;
    const okDec = ofDecide('OF1', true) === true
      && OFFS.find(o => o.id === 'OF1').status === 'อนุมัติแล้ว'
      && OFFS.find(o => o.id === 'OF1').decidedBy === ME.nick;
    /* ของตัวเองตัดสินไม่ได้ */
    const selfBlocked = ofDecide(OFFS[n].id, true) === false;
    return { backBlocked, saved, noNote, okDec, selfBlocked };
  });
  if (!t4.backBlocked) bad('ขอออกนอกสถานที่ย้อนหลังได้ (ต้องขอล่วงหน้า)');
  if (!t4.saved)       bad('ส่งคำขอออกนอกสถานที่ไม่สำเร็จ');
  if (!t4.noNote)      bad('ตีกลับคำขอโดยไม่บอกเหตุผลได้');
  if (!t4.okDec)       bad('อนุมัติคำขอไม่บันทึกผู้ตัดสิน');
  if (!t4.selfBlocked) bad('อนุมัติคำขอของตัวเองได้');

  /* 5 · วันหยุดบริษัท (H5): โผล่ใน calEvents ทุกคน · เพิ่มซ้ำวันไม่ได้ · ลบได้ */
  const t5 = await p.evaluate(() => {
    const inCal = calEvents().some(e => e.k === 'hol');
    const n = HOLIDAYS.length;
    const added = holSave(addDays(curDate(), 60), 'หยุดทดสอบ') === true && HOLIDAYS.length === n + 1;
    const dup = holSave(addDays(curDate(), 60), 'ซ้ำ') === false && HOLIDAYS.length === n + 1;
    const hid = HOLIDAYS[HOLIDAYS.length - 1].id;
    const deleted = holDel(hid) === true && HOLIDAYS.length === n;
    return { inCal, added, dup, deleted };
  });
  if (!t5.inCal)   bad('วันหยุดไม่โผล่ใน calEvents');
  if (!t5.added)   bad('แอดมินเพิ่มวันหยุดไม่ได้');
  if (!t5.dup)     bad('เพิ่มวันหยุดซ้ำวันเดิมได้');
  if (!t5.deleted) bad('ลบวันหยุดไม่ได้');

  /* 6 · ศูนย์ซ่อม: วันที่เลือกได้ (K9) ห้ามอนาคต · ป้าย "ยอดชำระ" แทน "ค่าแรง" (K13) */
  const t6 = await p.evaluate(() => {
    go('service'); rService();
    $('#svName').value = 'ทดสอบ เคเก้า'; $('#svSearch').value = 'E-TEST-K9';
    $('#svPart').value = ''; $('#svKm').value = '900';
    const n = SERVICE.length;
    $('#svDate').value = addDays(curDate(), 2);
    svSave();
    const futureBlocked = SERVICE.length === n;
    $('#svDate').value = addDays(curDate(), -3);
    svSave();
    const saved = SERVICE.length === n + 1 && SERVICE[n].at === addDays(curDate(), -3);
    const labels = [...document.querySelectorAll('#s-service label')].map(l => l.textContent);
    return { futureBlocked, saved,
      pay: labels.some(t => t.includes('ยอดชำระ')), old: labels.some(t => t.includes('ค่าแรง')) };
  });
  if (!t6.futureBlocked) bad('เปิดใบงานลงวันที่อนาคตได้ (K9)');
  if (!t6.saved)         bad('เปิดใบงานย้อนวันไม่ได้ หรือวันที่ไม่ตรงที่เลือก (K9)');
  if (!t6.pay)           bad('หน้าศูนย์ซ่อมไม่มีป้าย "ยอดชำระ" (K13)');
  if (t6.old)            bad('หน้าศูนย์ซ่อมยังมีป้าย "ค่าแรง" อยู่ (K13)');

  /* 7 · ปฏิทินเปิดทุกบทบาท (H5) — ค่าเริ่มต้นของตารางสิทธิ์ */
  const t7 = await p.evaluate(() => {
    const P = permDefaults();
    return Object.keys(ROLES).filter(r => P[r]['page:cal'] !== 'write');
  });
  if (t7.length) bad('บทบาทยังไม่เห็นปฏิทิน: ' + t7.join(', '));

  /* 8 · ลงเวลาโหมดจริง (H1): punch ต้องอัปรูป + ยิง RPC punch_clock — ดักด้วย stub */
  const t8 = await p.evaluate(async () => {
    const s0 = SITES.find(x => x.branch === ME.branch);
    if (!s0) return { skip: 'ไม่มีจุดลงเวลาใน seed' };
    const photoId = await photoSave('data:image/jpeg;base64,/9j/4AAQ', 640, 480, 'fresh', new Date().toISOString());
    const proof = { photoId, geo: { lat: s0.lat, lng: s0.lng, acc: 10, n: 3 },
      photoAt: new Date().toISOString(), geoAt: new Date().toISOString(),
      openedAt: new Date().toISOString(), reason: '' };
    let up = 0; const rpc = [];
    const _u = sbUpload, _f = sbFetch;
    sbUpload = async () => { up++; return 'x'; };
    sbFetch = async (path, opt) => { rpc.push({ path, body: JSON.parse(opt.body) }); return {}; };
    LIVE = true;
    const t = punch(ME.id, 'in', proof);
    await new Promise(r => setTimeout(r, 400));
    LIVE = false; sbUpload = _u; sbFetch = _f;
    const call = rpc.find(x => x.path.includes('punch_clock'));
    return { punched: !!t, up, gotRpc: !!call,
      side: call && call.body.p_side === 'in',
      photo: call && typeof call.body.p_photo_url === 'string' && call.body.p_photo_url.startsWith('att/'),
      fresh: call && !!call.body.p_photo_at && !!call.body.p_geo_at };
  });
  if (t8.skip) bad('ข้ามลงเวลา: ' + t8.skip);
  else {
    if (!t8.punched) bad('punch ไม่ผ่านทั้งที่หลักฐานครบ');
    if (t8.up !== 1) bad('โหมดจริงไม่อัปรูปขึ้น Storage (ได้ ' + t8.up + ' ครั้ง)');
    if (!t8.gotRpc)  bad('โหมดจริงไม่เรียก RPC punch_clock (H1)');
    if (t8.gotRpc && !(t8.side && t8.photo && t8.fresh)) bad('พารามิเตอร์ punch_clock ไม่ครบ/ผิดรูป');
  }

  /* 9 · งานผู้บริหาร: ด่านอยู่ในปุ่มบันทึก — เซลล์เรียกตรงต้องไม่เพิ่ม */
  const t9 = await p.evaluate(() => {
    const real = ME;
    ME = Object.assign({}, ME, { id: 'ST3', role: 'sales' });
    execEventModal();
    $('#evTitle').value = 'งานปลอมโดยเซลล์';
    const n = EXEC_EVENTS.length;
    $('#evGo').onclick();
    const blocked = EXEC_EVENTS.length === n;
    closeModal(); ME = real;
    return { blocked };
  });
  if (!t9.blocked) bad('เซลล์เพิ่มงานผู้บริหารได้ (ด่านหลุดจากฟังก์ชันเขียน)');

  await ctx.close();

  /* ---------- ฝั่งเพื่อนร่วมงาน (เซลล์ ST3) — ความเป็นส่วนตัว ---------- */
  const ctx2 = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } });
  const p2 = await ctx2.newPage();
  p2.on('pageerror', e => errors.push('B PAGEERROR ' + e.message));
  await p2.goto(BASE + '/index.html');
  await p2.click('#lgUsers [data-id="ST3"]'); await p2.click('#lgGo'); await p2.waitForTimeout(400);

  const t10 = await p2.evaluate(() => {
    go('hr'); rHr();
    /* รายละเอียดใบลาคนอื่น (เหตุผล/หลักฐาน/ประเภท) ต้องเปิดไม่ได้ */
    lvDetail('LV1');
    const noModal = !$('#modal').classList.contains('on');
    const noType = ($('#mdB').innerHTML || '').indexOf('ลาป่วย') < 0;
    /* ปุ่ม "ดู" มีเฉพาะใบของตัวเอง */
    const btns = [...document.querySelectorAll('#lvTable [data-lvv]')]
      .map(x => (LEAVES.find(l => l.id === x.dataset.lvv) || {}).staffId);
    const onlyMine = btns.length > 0 && btns.every(sid => sid === ME.id);
    /* วันหยุด: เซลล์เห็นในปฏิทิน แต่เพิ่ม/ลบเองไม่ได้ */
    const seeHol = calEvents().some(e => e.k === 'hol');
    const n = HOLIDAYS.length;
    const addBlocked = holSave(addDays(curDate(), 70), 'โดยเซลล์') === false && HOLIDAYS.length === n;
    const delBlocked = holDel(HOLIDAYS[0].id) === false && HOLIDAYS.length === n;
    /* คำขอออกนอกสถานที่ของคนอื่น — เซลล์ตัดสินไม่ได้ */
    OFFS.push({ id: 'OFX', staffId: 'ST6', date: addDays(curDate(), 2), place: 'x', reason: '', status: 'รออนุมัติ' });
    const ofBlocked = ofDecide('OFX', true) === false
      && OFFS.find(o => o.id === 'OFX').status === 'รออนุมัติ';
    return { noModal, noType, onlyMine, seeHol, addBlocked, delBlocked, ofBlocked };
  });
  if (!t10.noModal || !t10.noType) bad('[sales] เปิดรายละเอียดใบลาของคนอื่นได้ (ประเภทลา = ข้อมูลสุขภาพ)');
  if (!t10.onlyMine)   bad('[sales] ปุ่ม "ดู" ใบลาโผล่ที่ใบของคนอื่น');
  if (!t10.seeHol)     bad('[sales] ไม่เห็นวันหยุดบริษัทในปฏิทิน (H5)');
  if (!t10.addBlocked) bad('[sales] เพิ่มวันหยุดได้');
  if (!t10.delBlocked) bad('[sales] ลบวันหยุดได้');
  if (!t10.ofBlocked)  bad('[sales] ตัดสินคำขอออกนอกสถานที่ของคนอื่นได้');

  await ctx2.close();

  console.log(fails.length ? 'FAILS:\n' + [...new Set(fails)].join('\n') : 'ALL_CHECKS_PASS');
  console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})();
