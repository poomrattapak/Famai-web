/* ด่าน v1.39 — หลายตำแหน่งต่อคน สิทธิ์รวมกันแบบมากสุดชนะ (คำตอบเจ้าของข้อ 9)
   ล็อก:
   [1] staffSetRoles: ด่านแอดมินในฟังก์ชันเขียน — เซลล์เรียกตรงต้องถูกปฏิเสธ ·
       แอดมินตั้งได้ ตำแหน่งหลักติดอยู่ในชุดเสมอ
   [2] เมนู union: สต๊อก+ฝ่ายบริการ เห็นทั้งหน้าสต๊อกและหน้าดูแลหลังการขาย
   [3] บิต union: สต๊อก(สาขาเดียว)+ฝ่ายบริการ(ทุกสาขา) → เห็นทุกสาขา · ตัวเงินยังซ่อน
       (ไม่มีตำแหน่งไหนให้) — มากสุดชนะ ไม่ใช่แถมเกิน
   [4] สิทธิ์เขียน union: ติ๊กงานฝ่ายบริการได้จริงผ่าน careTick (เดิมสต๊อกโดนปฏิเสธ)
       และงานเดิมของสต๊อก (act:transfer) ยังอยู่ครบ
   [5] no-regression: คนตำแหน่งเดียวทุกคน สิทธิ์เท่าเดิมเป๊ะ (บิต+ตารางสิทธิ์)
   [6] ป้ายบอก: คนหลายตำแหน่งเห็น "+n ตำแหน่ง" ข้างชื่อ
   [7] หน้าบัญชีผู้ใช้: แอดมินมีปุ่มแก้ตำแหน่ง+โมดัลบันทึกจริง · บทบาทอื่นไม่มีปุ่ม */
const { chromium, EXE, BASE } = require('./env');

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errors = [];
  const bad = m => fails.push(m);
  const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  const login = async id => { await p.goto(BASE + '/index.html');
    await p.click('#lgUsers [data-id="' + id + '"]'); await p.click('#lgGo'); await p.waitForTimeout(450); };

  /* ---------- [1] ด่าน staffSetRoles ---------- */
  await login('ST3');
  const g1a = await p.evaluate(() => {
    const r = staffSetRoles('ST6', ['care']);
    const s = STAFF.find(x => x.id === 'ST6');
    return { blocked: r === false && !(s.roles && s.roles.length) };
  });
  if (!g1a.blocked) bad('[1] เซลล์เรียก staffSetRoles ตรง ๆ ได้ — ด่าน §9b หลุด');
  await login('ST1');
  const g1b = await p.evaluate(() => {
    const ok = staffSetRoles('ST6', ['care']);
    const s = STAFF.find(x => x.id === 'ST6');
    return { ok, roles: (s.roles || []).join(','), hasPrimary: (s.roles || []).indexOf('stock') >= 0 };
  });
  if (!g1b.ok || g1b.roles.indexOf('care') < 0) bad('[1] แอดมินตั้งตำแหน่งเพิ่มไม่ได้ (' + g1b.roles + ')');
  if (!g1b.hasPrimary) bad('[1] ตำแหน่งหลักหลุดจากชุด (' + g1b.roles + ')');

  /* ---------- [2]+[3]+[4] union — สลับเป็น ST6 ที่มีสองตำแหน่ง (ในหน้าเดิม กัน seed รีเซ็ต) ---------- */
  const g2 = await p.evaluate(() => {
    ME = STAFF.find(x => x.id === 'ST6'); buildNav(); refreshAll();
    const menus = { stock: canSee('stock'), aftercare: canSee('aftercare'),
      report: canSee('report'), payroll: canSee('payroll') };
    const bits = { allBranch: rolePerm().allBranch, money: rolePerm().money,
      inFMM: inScope('FMM01'), noMoney: noMoney() };
    /* [4] เขียนจริง — งานฝ่ายบริการ */
    const cr = CARE[0];
    let tick = false, tickBack = false;
    if (cr) { const before = cr.check[0].done;
      tick = careTick(cr.id, 0) === true && cr.check[0].done === !before;
      tickBack = careTick(cr.id, 0) === true && cr.check[0].done === before; }
    const transferStill = canTransfer();
    return { menus, bits, tick: tick && tickBack, transferStill, hasCare: !!cr };
  });
  if (!g2.menus.stock || !g2.menus.aftercare)
    bad('[2] สองตำแหน่งแล้วเมนูไม่ union (stock=' + g2.menus.stock + ' aftercare=' + g2.menus.aftercare + ')');
  if (!g2.bits.allBranch || !g2.bits.inFMM) bad('[3] ฝ่ายบริการเห็นทุกสาขาแต่คนสองตำแหน่งยังติดสาขาเดียว');
  if (g2.bits.money || !g2.bits.noMoney) bad('[3] ไม่มีตำแหน่งไหนให้เห็นตัวเงินแต่กลับเห็น — union แถมเกิน');
  if (g2.hasCare && !g2.tick) bad('[4] สองตำแหน่งแล้ว careTick ยังถูกปฏิเสธ — สิทธิ์เขียนไม่ union');
  if (!g2.transferStill) bad('[4] ได้ตำแหน่งเพิ่มแล้วสิทธิ์เดิมของสต๊อกหาย');

  /* ---------- [5] no-regression คนตำแหน่งเดียว ---------- */
  const g5 = await p.evaluate(() => {
    const out = [];
    STAFF.filter(s => !(s.roles && s.roles.length > 1)).forEach(s => {
      ME = s;
      const p0 = ROLES[s.role];
      const rp = rolePerm();
      ['money', 'allBranch', 'approve', 'admin'].forEach(k => {
        if ((rp[k] ? 1 : 0) !== (p0[k] ? 1 : 0)) out.push(s.id + '.' + k); });
      /* ตารางสิทธิ์ต้องเท่ากับอ่านตรงจาก PERMS ของตำแหน่งเดียว */
      const keys = Object.keys(PERMS[s.role] || {});
      for (const k of keys.slice(0, 25))
        if (perm(k) !== ((PERMS[s.role] || {})[k] || 'none')) { out.push(s.id + ':' + k); break; }
    });
    ME = STAFF.find(x => x.id === 'ST1');
    return out;
  });
  if (g5.length) bad('[5] คนตำแหน่งเดียวสิทธิ์เปลี่ยน: ' + g5.slice(0, 5).join(', '));

  /* ---------- [6] ป้าย +n ตำแหน่ง ---------- */
  const g6 = await p.evaluate(() => {
    ME = STAFF.find(x => x.id === 'ST6'); meLabel(); buildNav();
    const txt = $('#meRole').textContent, more = document.querySelector('#moreB').textContent;
    ME = STAFF.find(x => x.id === 'ST1'); meLabel(); buildNav();
    const txt1 = $('#meRole').textContent;
    return { multi: txt.indexOf('+1 ตำแหน่ง') >= 0 && more.indexOf('+1 ตำแหน่ง') >= 0,
      single: txt1.indexOf('ตำแหน่ง') < 0 };
  });
  if (!g6.multi) bad('[6] คนสองตำแหน่งไม่มีป้าย "+1 ตำแหน่ง"');
  if (!g6.single) bad('[6] คนตำแหน่งเดียวมีป้าย +ตำแหน่งโผล่มา');

  /* ---------- [7] หน้าบัญชีผู้ใช้ ---------- */
  const g7 = await p.evaluate(() => {
    go('users'); rUsers();
    const btn = document.querySelector('#s-users [data-uroles="ST9"]');
    if (!btn) return { noBtn: true };
    staffRolesModal('ST9');
    const boxes = document.querySelectorAll('#modal [data-urchk]').length;
    const chk = document.querySelector('#modal [data-urchk="hr"]');
    if (chk) chk.checked = true;
    $('#urGo').onclick();
    const s = STAFF.find(x => x.id === 'ST9');
    const saved = (s.roles || []).indexOf('hr') >= 0 && (s.roles || []).indexOf('tech') >= 0;
    staffSetRoles('ST9', []);                            /* คืนสภาพ */
    return { noBtn: false, boxes, saved };
  });
  if (g7.noBtn) bad('[7] แอดมินไม่มีปุ่มแก้ตำแหน่ง');
  else {
    if (g7.boxes < 5) bad('[7] โมดัลมี checkbox แค่ ' + g7.boxes);
    if (!g7.saved) bad('[7] ติ๊กแล้วบันทึกไม่ลง STAFF');
  }
  await login('ST3');
  const g7b = await p.evaluate(() => { go('users');
    return { cur: CUR, btn: !!document.querySelector('#s-users [data-uroles]') }; });
  if (g7b.cur === 'users' && g7b.btn) bad('[7] บทบาทอื่นเห็นปุ่มแก้ตำแหน่ง');

  await b.close();
  if (errors.length) fails.push(...errors);
  if (fails.length) { console.log('FAILS:'); fails.forEach(f => console.log(f)); process.exit(1); }
  console.log('ALL_CHECKS_PASS (multirole-r39: 7 ข้อ)');
})().catch(e => { console.error('SUITE_CRASH', e); process.exit(2); });
