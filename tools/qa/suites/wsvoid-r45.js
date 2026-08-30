/* ด่าน v1.45 — ยกเลิกบิลขายส่ง
   คำสั่งเจ้าของ 28 ส.ค. 2569: "ถ้าเปิดบิลแบบขายส่ง รถจะตัดสต๊อกไหมครับ แล้วถ้าต้องการยกเลิกบิล
   จะต้องกดยังไง ถ้าเกิดไม่มีให้ยกเลิก ทำยกเลิกบิลด้วย"
   คำตอบเพิ่ม: "ยกเลิกได้ก่อนการเงินตรวจผ่านเท่านั้น" · "ใบวางบิลออกไปแล้วยกเลิกได้ แต่ต้องเตือนให้ชัด"
   ล็อก:
   [1]  บิลปกติมีปุ่มยกเลิกจริง และปุ่มเดิมอีก 4 ตัวยังครบ
   [2]  ด่านสิทธิ์อยู่ในฟังก์ชัน (§9b) — การเงิน (ไม่มี act:voidSale) เรียก wsVoid ตรงต้องไม่ผ่าน
   [3]  ด่านขอบเขตสาขา — เปิดสิทธิ์ให้เซลล์แล้วยังยกเลิกบิลข้ามสาขาไม่ได้
   [4]  การเงินตรวจผ่านแล้ว ยกเลิกไม่ได้ (คำสั่งเจ้าของ)
   [5a] บังคับกรอกเหตุผล ('' · '   ' · null) และต้องไม่เขียนอะไรเลยเมื่อไม่ผ่าน
   [5b] ดอกจันไม่โกหก — ช่องเหตุผลมี .rq จริง และกดยืนยันทั้งที่ว่างแล้วแผ่นไม่ปิด
   [6]  คู่ค้าภายนอก: คืนรถเป็น available ที่สาขาเดิม + ฟิลด์หลักฐานครบ (voidedAt/voidReason/voidedBy)
   [7]  บริษัทในเครือ: wsCommit จำ dest · ยกเลิกแล้วรถกลับสาขาผู้ขาย สถานะยังว่าง
   [8]  รถถูกใช้ต่อไปแล้ว ยกเลิกไม่ได้ — ขายปลีก · จอง · โอนย้าย · บิลใบอื่น · ย้ายสาขาไปแล้ว
        และเมื่อเอาตัวขวางออกต้องยกเลิกได้ (พิสูจน์ว่าตกที่ด่านนี้จริง ไม่ใช่ด่านอื่น)
   [9]  บิลที่ยกเลิกแล้ว = เอกสารตาย — พิมพ์/ใบวางบิล/การเงินตรวจ/ยกซ้ำ ต้องไม่ผ่านทั้งหมด
   [10] เลขเอกสารห้ามคืนเข้าตัวนับ (กฎสรรพากร) — peekDocNo หลังยกเลิกต้องเดินหน้าต่อ
   [11] จุดกรอง 5 ทาง — รายงานภาษี · ชุดส่งบัญชี (ยัง 6 ไฟล์) · ปิดคู่ค้าได้ · brRefs ไม่ลด · ส่งออกยังมีแถว
   [12] หน้าตาบิลที่ยกเลิก — มีคำว่า "ยกเลิกแล้ว" เป็นข้อความ · ปุ่ม 0 ตัว · กล่อง ≤2 ชั้น · ไม่ล้นข้างที่ 390
        (ด่านนี้เป็นตัวเดียวที่เฝ้ากฎ UI ของการ์ดนี้ — boxdepth/nohscroll ไม่มีวันเห็นบิลที่ยกเลิก
         เพราะ WSALES ว่างเสมอ และ bugs-r31 ห้ามเพิ่มบิลขายส่งลง seed) */
const { chromium, EXE, BASE } = require('./env');

const HELPERS = () => {
  window.__F = []; csv = (n, h, r) => window.__F.push({ n: n, h: h, rows: r });
  window.__P = 0; printHTML = () => { window.__P++; };
  window.__imp = id => { const st = STAFF.find(s => s.id === id);
    ME = { id: st.id, name: st.name, nick: st.nick, role: st.role, branch: st.branch }; };
  window.__set = (role, key, val) => { if (PERMS[role][key] !== val) permSet(role, key); };
  /* สร้างบิลด้วยแกนจริง (wsCommit) — seed ไม่มีบิลขายส่งและห้ามเพิ่ม (bugs-r31:63 ล็อก want=ss+1) */
  window.__bill = (own, br, n) => {
    n = n || 1;
    const pt = WS_PARTNERS.find(x => own ? !!x.own : !x.own);
    const byBr = {};
    UNITS.filter(u => u.status === 'available' && (!br || u.branch === br))
      .forEach(u => { (byBr[u.branch] = byBr[u.branch] || []).push(u); });
    const src = br || Object.keys(byBr).find(k => byBr[k].length >= n);
    if (!src || !byBr[src] || byBr[src].length < n) return null;
    const dest = own ? (branchesOf(pt.own).find(x => x.code !== src) || {}).code : '';
    if (own && !dest) return null;
    return wsCommit(pt, src, dest, byBr[src].slice(0, n).map(u => ({ unitId: u.id, price: 107000 })), 'QA');
  };
};

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errors = [];
  const bad = m => fails.push(m);
  const ctx = await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } });
  ctx.setDefaultTimeout(8000);
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  const login = async id => {
    await p.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await p.click('#lgUsers [data-id="' + id + '"]'); await p.click('#lgGo'); await p.waitForTimeout(400);
    await p.evaluate(HELPERS);
  };

  await login('ST1');                       /* แอดมิน — เห็นทุกสาขา ทำได้ทุกอย่าง */

  /* ---------- มีของให้ทดสอบไหม ---------- */
  /* อ้างชื่อตรง ๆ ไม่ผ่าน window — const ที่ประกาศระดับบนสุดไม่กลายเป็น property ของ window */
  const api = await p.evaluate(() => {
    const miss = [];
    if (typeof wsVoid !== 'function') miss.push('wsVoid');
    if (typeof wsVoided !== 'function') miss.push('wsVoided');
    if (typeof wsUnitBusy !== 'function') miss.push('wsUnitBusy');
    if (typeof wsVoidModal !== 'function') miss.push('wsVoidModal');
    if (typeof wsFinPass !== 'function') miss.push('wsFinPass');
    return miss;
  });
  if (api.length) {
    bad('ยังไม่มีฟังก์ชัน: ' + api.join(' · '));
    await b.close();
    console.log('FAILS:'); fails.forEach(f => console.log(f)); process.exit(1);
  }

  /* ---------- [1] ปุ่มยกเลิกมีจริง ---------- */
  const g1 = await p.evaluate(() => {
    const w = __bill(false, '', 1); if (!w) return { skip: 1 };
    go('invoice', '#ivTabs [data-p="iv2"]'); rWsSale();
    const card = [...document.querySelectorAll('#wsList .acblk')]
      .find(x => x.textContent.indexOf(w.docNo) >= 0);
    return { skip: 0, id: w.id,
      card: !!card,
      v: card ? card.querySelectorAll('[data-wsv]').length : 0,
      old: card ? ['wsp2', 'wsptx', 'wsbill', 'wsap']
        .filter(k => card.querySelector('[data-' + k + ']')).length : 0 };
  });
  if (g1.skip) bad('[1] สต๊อกว่างไม่พอสร้างบิลทดสอบ');
  else {
    if (!g1.card) bad('[1] บิลที่เพิ่งเปิดไม่ขึ้นใน #wsList');
    if (g1.v !== 1) bad('[1] ปุ่มยกเลิกบิลมี ' + g1.v + ' ตัว ควรมี 1');
    if (g1.old !== 4) bad('[1] ปุ่มเดิมหายไป — เหลือ ' + g1.old + ' จาก 4');
  }

  /* ---------- [2] ด่านสิทธิ์อยู่ในฟังก์ชัน ---------- */
  const g2 = await p.evaluate(() => {
    const w = __bill(false, '', 1); if (!w) return { skip: 1 };
    const u = UNITS.find(x => x.id === w.items[0].unitId);
    __imp('ST7');                                  /* การเงิน — เห็นทุกสาขา แต่ไม่มี act:voidSale */
    const blocked = wsVoid(w.id, 'ลองยกเลิก') === false && !wsVoided(w) && u.status === 'sold';
    __imp('ST1');
    const ok = wsVoid(w.id, 'แอดมินยกเลิก') === true && wsVoided(w);
    return { skip: 0, blocked, ok, perm: perm('act:voidSale') };
  });
  if (g2.skip) bad('[2] สต๊อกไม่พอ');
  else {
    if (!g2.blocked) bad('[2] การเงินเรียก wsVoid ตรง ๆ แล้วยกเลิกได้ — ด่านสิทธิ์ไม่ได้อยู่ในฟังก์ชัน');
    if (!g2.ok) bad('[2] แอดมินยกเลิกไม่ได้ (ด่านแน่นเกิน)');
  }

  /* ---------- [3] ด่านขอบเขตสาขา ---------- */
  const g3 = await p.evaluate(() => {
    const st3 = STAFF.find(s => s.id === 'ST3');
    const mine = __bill(false, st3.branch, 1);
    const other = __bill(false, BRANCHES.map(x => x.code).find(c => c !== st3.branch), 1);
    if (!mine || !other) return { skip: 1 };
    __set('sales', 'act:voidSale', 'write');
    __imp('ST3');                                  /* เซลล์ — มีสิทธิ์แล้ว แต่เห็นสาขาเดียว */
    const off = wsVoid(other.id, 'ข้ามสาขา') === false && !wsVoided(other);
    const on = wsVoid(mine.id, 'สาขาตัวเอง') === true && wsVoided(mine);
    __imp('ST1'); __set('sales', 'act:voidSale', 'none');
    return { skip: 0, off, on };
  });
  if (g3.skip) bad('[3] สต๊อกไม่พอสองสาขา');
  else {
    if (!g3.off) bad('[3] ยกเลิกบิลของสาขาอื่นได้ — ไม่มีด่าน inScope');
    if (!g3.on) bad('[3] เซลล์ที่มีสิทธิ์ยกเลิกบิลสาขาตัวเองไม่ได้ (ตกด่านผิดตัว)');
  }

  /* ---------- [4] ก่อนการเงินตรวจผ่านเท่านั้น ---------- */
  const g4 = await p.evaluate(() => {
    const w = __bill(false, '', 1); if (!w) return { skip: 1 };
    const u = UNITS.find(x => x.id === w.items[0].unitId);
    w.finApproval = { status: 'ผ่าน', by: 'QA', at: TODAY, note: '' };
    const passBlocked = wsVoid(w.id, 'ตรวจผ่านแล้ว') === false && !wsVoided(w) && u.status === 'sold';
    w.finApproval = { status: 'รอตรวจ', by: '', at: '', note: '' };
    const waitOk = wsVoid(w.id, 'ยังไม่ตรวจ') === true && wsVoided(w);
    return { skip: 0, passBlocked, waitOk };
  });
  if (g4.skip) bad('[4] สต๊อกไม่พอ');
  else {
    if (!g4.passBlocked) bad('[4] การเงินตรวจผ่านแล้วยังยกเลิกได้ — ผิดคำสั่งเจ้าของ');
    if (!g4.waitOk) bad('[4] บิลที่ยังรอตรวจกลับยกเลิกไม่ได้');
  }

  /* ---------- [5a] เหตุผลบังคับ ---------- */
  const g5 = await p.evaluate(() => {
    const w = __bill(false, '', 1); if (!w) return { skip: 1 };
    const u = UNITS.find(x => x.id === w.items[0].unitId);
    const empty = [wsVoid(w.id, ''), wsVoid(w.id, '   '), wsVoid(w.id, null), wsVoid(w.id)];
    const clean = !wsVoided(w) && u.status === 'sold';
    const ok = wsVoid(w.id, 'คู่ค้ายกเลิกคำสั่งซื้อ') === true;
    return { skip: 0, empty: empty.every(x => x === false), clean, ok, why: w.voidReason };
  });
  if (g5.skip) bad('[5a] สต๊อกไม่พอ');
  else {
    if (!g5.empty) bad('[5a] ยกเลิกได้ทั้งที่ไม่กรอกเหตุผล');
    if (!g5.clean) bad('[5a] ไม่ผ่านด่านเหตุผลแล้วยังมีอะไรถูกเขียนไปแล้ว');
    if (!g5.ok) bad('[5a] กรอกเหตุผลแล้วยังยกเลิกไม่ได้');
    if (g5.why !== 'คู่ค้ายกเลิกคำสั่งซื้อ') bad('[5a] เหตุผลไม่ถูกเก็บ (ได้ "' + g5.why + '")');
  }

  /* ---------- [5b] ดอกจันไม่โกหก ---------- */
  const g5b = await p.evaluate(() => {
    const w = __bill(false, '', 1); if (!w) return { skip: 1 };
    wsVoidModal(w.id);
    const f = document.getElementById('wsvWhy');
    if (!f) return { skip: 0, nofield: 1 };
    const lab = [...document.querySelectorAll('#mdB label.fl')]
      .find(l => { for (let s = l.nextElementSibling; s; s = s.nextElementSibling)
        if (s === f || (s.querySelector && s.querySelector('#wsvWhy'))) return true; return false; });
    const rq = lab && lab.querySelector('.rq');
    /* ต้องวัดขนาดก่อนปิดแผ่น — ปิดแล้ว offsetWidth เป็น 0 เสมอ ไม่ว่าดอกจันจะมีจริงหรือไม่ */
    const out = { skip: 0, nofield: 0,
      rq: !!rq, star: rq ? rq.textContent.trim() : '', wide: rq ? rq.offsetWidth > 0 : false,
      inReq: REQ.indexOf('wsvWhy') >= 0, stay: false };
    document.getElementById('wsvGo').click();
    out.stay = document.getElementById('modal').classList.contains('on') && !wsVoided(w);
    closeModal();
    return out;
  });
  if (g5b.skip) bad('[5b] สต๊อกไม่พอ');
  else if (g5b.nofield) bad('[5b] เปิดแผ่นยกเลิกแล้วไม่มีช่อง #wsvWhy');
  else {
    if (!g5b.rq) bad('[5b] ช่องเหตุผลบังคับกรอกแต่ป้ายไม่มีดอกจัน');
    if (g5b.star !== '*') bad('[5b] ดอกจันไม่ใช่ตัว * (ได้ "' + g5b.star + '")');
    if (!g5b.wide) bad('[5b] ดอกจันมองไม่เห็น (กว้าง 0)');
    if (g5b.inReq) bad('[5b] #wsvWhy ไปอยู่ใน REQ — ต้องฝังดอกจันในมาร์กอัปแทน');
    if (!g5b.stay) bad('[5b] กดยืนยันทั้งที่ช่องว่าง แล้วแผ่นปิด/บิลถูกยกเลิก');
  }

  /* ---------- [6] คืนรถคู่ค้าภายนอก + ฟิลด์หลักฐาน ---------- */
  const g6 = await p.evaluate(() => {
    const w = __bill(false, '', 2); if (!w) return { skip: 1 };
    const us = w.items.map(x => UNITS.find(z => z.id === x.unitId));
    const soldFirst = us.every(u => u.status === 'sold');
    const ok = wsVoid(w.id, 'เปิดบิลผิดคัน');
    return { skip: 0, soldFirst, ok,
      back: us.every(u => u.status === 'available' && u.branch === w.branch),
      at: w.voidedAt === TODAY, why: w.voidReason === 'เปิดบิลผิดคัน', by: w.voidedBy === ME.nick,
      noFlag: w.void === undefined };
  });
  if (g6.skip) bad('[6] สต๊อกไม่พอ 2 คัน');
  else {
    if (!g6.soldFirst) bad('[6] เปิดบิลภายนอกแล้วรถไม่ถูกตัดสต๊อก (เตรียมเคสไม่ได้)');
    if (!g6.ok) bad('[6] ยกเลิกไม่สำเร็จ');
    if (!g6.back) bad('[6] ยกเลิกแล้วรถไม่กลับเป็น available ที่สาขาผู้ขาย');
    if (!g6.at) bad('[6] ไม่ได้เขียน voidedAt');
    if (!g6.why) bad('[6] ไม่ได้เขียน voidReason');
    if (!g6.by) bad('[6] ไม่ได้เขียน voidedBy (ชื่อผู้กด ณ เวลาทำรายการ)');
    if (!g6.noFlag) bad('[6] มีฟิลด์ w.void ซ้ำกับ voidedAt — สถานะต้องมาจากช่องเดียว (§9g)');
  }

  /* ---------- [7] บริษัทในเครือ: จำ dest + คืนรถกลับสาขาผู้ขาย ---------- */
  const g7 = await p.evaluate(() => {
    const w = __bill(true, '', 1); if (!w) return { skip: 1 };
    const u = UNITS.find(x => x.id === w.items[0].unitId);
    const moved = u.branch === w.dest && u.status === 'available';
    const ok = wsVoid(w.id, 'ในเครือยกเลิก');
    return { skip: 0, dest: !!w.dest, moved, ok,
      back: u.branch === w.branch && u.status === 'available' };
  });
  if (g7.skip) bad('[7] ไม่มีคู่ค้าในเครือ/สาขาปลายทางให้ทดสอบ');
  else {
    if (!g7.dest) bad('[7] wsCommit ไม่จำสาขาปลายทาง (w.dest ว่าง) — ยกเลิกแล้วตรวจไม่ได้ว่ารถอยู่ที่เดิม');
    if (!g7.moved) bad('[7] เปิดบิลในเครือแล้วรถไม่ย้ายไปสาขาปลายทางแบบยังว่าง (เตรียมเคสไม่ได้)');
    if (!g7.ok) bad('[7] ยกเลิกบิลในเครือไม่สำเร็จ');
    if (!g7.back) bad('[7] ยกเลิกแล้วรถไม่กลับสาขาผู้ขายแบบยังว่าง');
  }

  /* ---------- [8] รถถูกใช้ต่อไปแล้ว ยกเลิกไม่ได้ ---------- */
  const g8 = await p.evaluate(() => {
    const out = {};
    const one = (name, block, un) => {
      const w = __bill(false, '', 1); if (!w) { out[name] = 'skip'; return; }
      const uid = w.items[0].unitId;
      block(uid);
      const blocked = wsVoid(w.id, 'ลอง') === false && !wsVoided(w);
      un(uid);
      const freed = wsVoid(w.id, 'เอาตัวขวางออกแล้ว') === true;
      out[name] = blocked && freed ? 'ok' : (blocked ? 'ตกด่านอื่น' : 'ไม่กัน');
    };
    one('ขายปลีก',
      uid => SALES.push({ id: 'QAV1', unitId: uid, custId: '', branch: ME.branch, soldAt: TODAY, net: 1 }),
      () => { const i = SALES.findIndex(s => s.id === 'QAV1'); if (i >= 0) SALES.splice(i, 1); });
    one('จอง',
      uid => BOOKINGS.push({ id: 'QAV2', unitId: uid, status: 'จองอยู่', name: 'QA', branch: ME.branch, at: TODAY }),
      () => { const i = BOOKINGS.findIndex(x => x.id === 'QAV2'); if (i >= 0) BOOKINGS.splice(i, 1); });
    one('โอนย้าย',
      uid => TRANSFERS.push({ id: 'QAV3', unitId: uid, status: 'กำลังโอนย้าย', at: TODAY }),
      () => { const i = TRANSFERS.findIndex(x => x.id === 'QAV3'); if (i >= 0) TRANSFERS.splice(i, 1); });
    one('บิลใบอื่น',
      uid => WSALES.push({ id: 'QAV4', partnerId: WS_PARTNERS[1].id, branch: ME.branch, at: TODAY,
        items: [{ unitId: uid, price: 1 }], total: 1, docNo: 'QA-WS-OTHER',
        finApproval: { status: 'รอตรวจ' } }),
      () => { const i = WSALES.findIndex(x => x.id === 'QAV4'); if (i >= 0) WSALES.splice(i, 1); });
    /* ในเครือ: รถถูกย้ายออกจากสาขาปลายทางไปแล้ว */
    const w = __bill(true, '', 1);
    if (!w) out['ย้ายสาขา'] = 'skip';
    else {
      const u = UNITS.find(x => x.id === w.items[0].unitId), keep = u.branch;
      u.branch = BRANCHES.map(x => x.code).find(c => c !== keep && c !== w.branch) || w.branch;
      const blocked = u.branch === keep ? false : (wsVoid(w.id, 'ลอง') === false && !wsVoided(w));
      u.branch = keep;
      const freed = wsVoid(w.id, 'คืนที่เดิมแล้ว') === true;
      out['ย้ายสาขา'] = blocked && freed ? 'ok' : (blocked ? 'ตกด่านอื่น' : 'ไม่กัน');
    }
    return out;
  });
  Object.keys(g8).forEach(k => {
    if (g8[k] === 'skip') bad('[8] ' + k + ': สต๊อกไม่พอ ทดสอบไม่ได้');
    else if (g8[k] === 'ไม่กัน') bad('[8] รถถูกใช้ต่อแล้ว (' + k + ') แต่ยังยกเลิกบิลได้ — รถจะโผล่สองที่');
    else if (g8[k] !== 'ok') bad('[8] ' + k + ': เอาตัวขวางออกแล้วยังยกเลิกไม่ได้ — ตกด่านอื่นไม่ใช่ด่านนี้');
  });

  /* ---------- [9] บิลที่ยกเลิกแล้ว = เอกสารตาย ---------- */
  const g9 = await p.evaluate(() => {
    const w = __bill(false, '', 1); if (!w) return { skip: 1 };
    wsBilling(w.id);                                  /* ออกใบวางบิลก่อน — เจ้าของบอกว่ายกเลิกได้ */
    const bill0 = w.billNo, n0 = window.__P;
    if (!wsVoid(w.id, 'ยกเลิกหลังออกใบวางบิล')) return { skip: 0, novoid: 1 };
    const why0 = w.voidReason;
    wsPrint(w.id, false); wsPrint(w.id, true);
    const billAgain = wsBilling(w.id);
    const fin = wsFinPass(w.id);
    const again = wsVoid(w.id, 'ยกซ้ำ');
    /* บิลที่ไม่มีรายการรถ (เกิดได้จริงกับข้อมูลที่นำเข้า และ qa-r22 ก็ฉีดแบบนี้) — ไม่มีรถให้ตรวจ
       ด่าน "ยกเลิกไปแล้ว" จึงเป็นตัวเดียวที่ยืนกันการกดซ้ำ ถ้าไม่มี หลักฐานเดิมจะถูกทับเงียบ ๆ */
    WSALES.push({ id: 'QAV9', partnerId: w.partnerId, branch: w.branch, at: TODAY,
      items: [], total: 0, docNo: 'QA-WS-EMPTY', finApproval: { status: 'รอตรวจ' } });
    const e = WSALES[WSALES.length - 1];
    const eFirst = wsVoid('QAV9', 'ยกครั้งแรก');
    const eAgain = wsVoid('QAV9', 'ยกครั้งที่สอง');
    const emptyKept = eFirst === true && eAgain === false && e.voidReason === 'ยกครั้งแรก';
    WSALES.splice(WSALES.indexOf(e), 1);
    return { skip: 0, novoid: 0, emptyKept,
      hadBill: !!bill0,
      noPrint: window.__P === n0,
      noBill: billAgain === false && w.billNo === bill0,
      noFin: fin === false && finApStatus(w) !== 'ผ่าน',
      noAgain: again === false && w.voidReason === why0 };
  });
  if (g9.skip) bad('[9] สต๊อกไม่พอ');
  else if (g9.novoid) bad('[9] บิลที่ออกใบวางบิลแล้วยกเลิกไม่ได้ — ผิดคำตอบเจ้าของ');
  else {
    if (!g9.hadBill) bad('[9] เตรียมเคสไม่ได้ — wsBilling ไม่ออกเลขใบวางบิล');
    if (!g9.noPrint) bad('[9] บิลที่ยกเลิกแล้วยังพิมพ์เอกสารได้');
    if (!g9.noBill) bad('[9] บิลที่ยกเลิกแล้วยังออกใบวางบิลใหม่ได้');
    if (!g9.noFin) bad('[9] บิลที่ยกเลิกแล้วยังให้การเงินตรวจผ่านได้ — บิลตายฟื้นมาออกใบกำกับ');
    if (!g9.noAgain) bad('[9] กดยกเลิกซ้ำแล้วเหตุผลเดิมถูกทับ');
    if (!g9.emptyKept) bad('[9] บิลที่ไม่มีรายการรถ กดยกเลิกซ้ำได้ — หลักฐานเดิมถูกเขียนทับ');
  }

  /* ---------- [10] เลขเอกสารห้ามคืนเข้าตัวนับ ---------- */
  const g10 = await p.evaluate(() => {
    const w = __bill(false, '', 1); if (!w) return { skip: 1 };
    wsBilling(w.id);
    const doc = w.docNo, bill = w.billNo;
    const nextDoc = peekDocNo(w.branch, 'WSALE'), nextBill = peekDocNo(w.branch, 'BILLING');
    if (!wsVoid(w.id, 'ทดสอบเลขเอกสาร')) return { skip: 0, novoid: 1 };
    const docSame = peekDocNo(w.branch, 'WSALE') === nextDoc;
    const billSame = peekDocNo(w.branch, 'BILLING') === nextBill;
    const w2 = __bill(false, w.branch, 1);
    return { skip: 0, novoid: 0,
      keepDoc: w.docNo === doc, keepBill: w.billNo === bill, docSame, billSame,
      fresh: w2 ? w2.docNo !== doc : null };
  });
  if (g10.skip) bad('[10] สต๊อกไม่พอ');
  else if (g10.novoid) bad('[10] ยกเลิกไม่สำเร็จ');
  else {
    if (!g10.keepDoc) bad('[10] ยกเลิกแล้วเลขที่บิลหาย — กฎสรรพากรบังคับให้คงไว้ในประวัติ');
    if (!g10.keepBill) bad('[10] ยกเลิกแล้วเลขใบวางบิลหาย');
    if (!g10.docSame) bad('[10] เลข WSALE ถูกคืนเข้าตัวนับ — เลขถัดไปย้อนกลับ');
    if (!g10.billSame) bad('[10] เลข BILLING ถูกคืนเข้าตัวนับ');
    if (g10.fresh === false) bad('[10] บิลใหม่ได้เลขซ้ำกับบิลที่ยกเลิกไป');
  }

  /* ---------- [11] จุดกรอง 5 ทาง ----------
     ห้ามจับคู่แถวด้วย docNo — FMG01/FMG02/FMG03 ใช้ prefix 'FMG' ร่วมกัน บิลใบที่หนึ่งของสองสาขา
     จึงได้สตริงเลขเอกสารเหมือนกันเป๊ะ · ใช้ "เหตุผลที่ยกเลิก" ซึ่งด่านนี้ตั้งเองให้ไม่ซ้ำแทน */
  const WHY11 = 'ทดสอบตัวกรอง-' + Math.round(1e6 * 0.428571);
  const g11 = await p.evaluate(WHY => {
    const w = __bill(false, '', 1); if (!w) return { skip: 1 };
    const vat = w.total - Math.round(w.total / (1 + CFG.vat / 100));
    const packRows = () => { go('expense'); const n = window.__F.length;
      document.querySelector('#expBook').click();
      const files = window.__F.slice(n);
      return { files: files.length, ws: (files.find(f => f.n.indexOf('ขายส่ง') >= 0) || {}).rows };
    };
    go('report');
    const t0 = rpBuild('tax'), rows0 = t0.rows.length;
    const refs0 = brRefs(w.branch), pack0 = packRows();
    if (!wsVoid(w.id, WHY)) return { skip: 0, novoid: 1 };
    /* วัด brRefs ทันทีหลังยกเลิก ก่อนจะสร้างบิล/คู่ค้าอะไรเพิ่ม ไม่งั้นตัวเลขขยับด้วยเหตุอื่น */
    const refs1 = brRefs(w.branch);
    const t1 = rpBuild('tax'), pack1 = packRows();
    /* ส่งออกขายส่ง — แถวของบิลนี้ต้องยังอยู่ และต้องมีช่องบอกว่ายกเลิกแล้ว */
    go('invoice', '#ivTabs [data-p="iv2"]');
    const n1 = window.__F.length; document.querySelector('#expWs').click();
    const exp = window.__F[n1];
    const row = exp ? exp.rows.find(r => r.some(c => String(c).indexOf(WHY) >= 0)) : null;
    /* ปิดคู่ค้าที่มีแต่บิลที่ยกเลิก — คู่ค้าชั่วคราวเพื่อไม่ให้บิลใบอื่นในชุดนี้มาปน */
    WS_PARTNERS.push({ id: 'QAWP45', name: 'QA คู่ค้าชั่วคราว', taxId: '', addr: '', phone: '', own: '', active: true });
    const pool = UNITS.filter(u => u.status === 'available');
    const wp = pool.length ? wsCommit(WS_PARTNERS[WS_PARTNERS.length - 1], pool[0].branch, '',
      [{ unitId: pool[0].id, price: 107000 }], 'QA') : null;
    let closed = null;
    if (wp && wsVoid(wp.id, WHY + '-partner')) {
      go('settings'); rWs();
      const btn = document.querySelector('[data-wpt="QAWP45"]');
      if (btn) { btn.onclick(); closed = WS_PARTNERS.find(x => x.id === 'QAWP45').active === false; }
    }
    return { skip: 0, novoid: 0,
      taxRows: t1.rows.length === rows0 - 1,
      taxVat: t0.kpi[0][1] !== t1.kpi[0][1],
      vat: vat,
      packFiles: pack1.files,
      packOut: (pack0.ws && pack1.ws) ? pack1.ws.length === pack0.ws.length - 1 : null,
      expIn: !!row,
      expStatus: row ? row.some(c => String(c).indexOf('ยกเลิก') === 0) : false,
      refs: refs1 === refs0, refs0: refs0, refs1: refs1,
      closed: closed };
  }, WHY11);
  if (g11.skip) bad('[11] สต๊อกไม่พอ');
  else if (g11.novoid) bad('[11] ยกเลิกไม่สำเร็จ');
  else {
    if (!g11.taxRows) bad('[11ก] บิลที่ยกเลิกยังอยู่ในรายงานภาษี — ยื่นภาษีเกิน');
    if (!g11.taxVat) bad('[11ก] ยอดภาษีขายไม่ลดหลังยกเลิก (ควรลด ' + g11.vat + ')');
    if (g11.packFiles !== 6) bad('[11ข] ชุดส่งบัญชีได้ ' + g11.packFiles + ' ไฟล์ ควรเป็น 6');
    if (g11.packOut === null) bad('[11ข] ชุดส่งบัญชีไม่มีไฟล์ขายส่ง');
    else if (!g11.packOut) bad('[11ข] บิลที่ยกเลิกยังอยู่ในชุดส่งบัญชี');
    if (!g11.expIn) bad('[11จ] บิลที่ยกเลิกหายจากไฟล์ส่งออกขายส่ง — ไฟล์ต้องเล่าเรื่องเดียวกับจอ');
    else if (!g11.expStatus) bad('[11จ] ไฟล์ส่งออกไม่มีช่องบอกว่าบิลนี้ถูกยกเลิก');
    if (!g11.refs) bad('[11ง] brRefs เปลี่ยนหลังยกเลิก (' + g11.refs0 + '→' + g11.refs1
      + ') — ระเบียนที่ยกเลิกยังต้องเป็นประวัติของสาขา');
    if (g11.closed === null) bad('[11ค] เตรียมเคสปิดคู่ค้าไม่ได้');
    else if (!g11.closed) bad('[11ค] คู่ค้าที่มีแต่บิลที่ยกเลิกแล้ว ยังปิดไม่ได้ — บิลตายบล็อกตลอดกาล');
  }

  /* ---------- [12] หน้าตาบิลที่ยกเลิก (390px) ---------- */
  await p.setViewportSize({ width: 390, height: 844 });
  const g12 = await p.evaluate(WHY => {
    const w = WSALES.find(x => x.voidReason === WHY); if (!w) return { skip: 1 };
    go('invoice', '#ivTabs [data-p="iv2"]'); rWsSale();
    const card = [...document.querySelectorAll('#wsList .acblk')]
      .find(x => x.textContent.indexOf(WHY) >= 0);
    if (!card) return { skip: 0, nocard: 1 };
    const t = card.textContent;
    /* นับชั้นกล่องแบบเดียวกับ boxdepth: อะไรที่มีพื้นหรือกินระยะด้านข้าง = 1 ชั้น */
    const eats = el => { const s = getComputedStyle(el);
      const bg = s.backgroundColor, solid = bg && bg !== 'transparent' && !/rgba\(0, 0, 0, 0\)/.test(bg);
      return solid || parseFloat(s.paddingLeft) > 0 || parseFloat(s.paddingRight) > 0
        || parseFloat(s.marginLeft) > 0 || parseFloat(s.marginRight) > 0
        || parseFloat(s.borderLeftWidth) > 0 || parseFloat(s.borderRightWidth) > 0; };
    let layers = 0;
    for (let el = card; el && el.id !== 'wsList'; el = el.parentElement) if (eats(el)) layers++;
    const list = document.getElementById('wsList');
    return { skip: 0, nocard: 0,
      label: t.indexOf('ยกเลิกแล้ว') >= 0,
      why: t.indexOf(w.voidReason) >= 0, by: t.indexOf(w.voidedBy) >= 0,
      when: t.indexOf(thDate(w.voidedAt)) >= 0, doc: t.indexOf(w.docNo) >= 0,
      btns: card.querySelectorAll('button,a').length,
      data: ['wsp2', 'wsptx', 'wsbill', 'wsap', 'wsv']
        .filter(k => card.querySelector('[data-' + k + ']')).length,
      layers, over: list.scrollWidth - list.clientWidth,
      body: document.body.scrollWidth - innerWidth };
  }, WHY11);
  if (g12.skip) bad('[12] ไม่มีบิลที่ยกเลิกให้ตรวจหน้าตา');
  else if (g12.nocard) bad('[12] บิลที่ยกเลิกหายจาก #wsList — audit ไม่ได้');
  else {
    if (!g12.label) bad('[12] ไม่มีคำว่า "ยกเลิกแล้ว" เป็นข้อความ (สื่อด้วยสีอย่างเดียวไม่ได้)');
    if (!g12.why) bad('[12] ไม่โชว์เหตุผลที่ยกเลิก');
    if (!g12.by) bad('[12] ไม่โชว์ชื่อผู้ยกเลิก');
    if (!g12.when) bad('[12] ไม่โชว์วันที่ยกเลิก');
    if (!g12.doc) bad('[12] เลขที่บิลหายจากการ์ด — ต้องอ่านเห็นตลอดไป');
    if (g12.btns) bad('[12] บิลที่ยกเลิกยังมีปุ่ม ' + g12.btns + ' ตัว — ปุ่มที่กดแล้วไม่ทำงานห้ามมี');
    if (g12.data) bad('[12] ยังมีปุ่ม data-* ของบิลปกติเหลืออยู่ ' + g12.data + ' ตัว');
    /* #wsList คือ .bd = ชั้นที่ 2 ของโควตาแล้ว อะไรที่มีพื้นหรือกินระยะด้านข้างข้างในจึงเป็นชั้นที่ 3 */
    if (g12.layers > 0) bad('[12] การ์ดบิลที่ยกเลิกซ้อนกล่องเพิ่ม ' + g12.layers
      + ' ชั้นใน #wsList — โควตา 2 ชั้นเต็มแล้ว (.card + .bd)');
    if (g12.over > 1) bad('[12] #wsList ล้นข้าง ' + g12.over + 'px ที่ 390');
    if (g12.body > 1) bad('[12] หน้าเลื่อนซ้าย-ขวาได้ ' + g12.body + 'px ที่ 390');
  }

  await b.close();
  if (errors.length) fails.push(...errors);
  if (fails.length) { console.log('FAILS:'); fails.forEach(f => console.log(f)); process.exit(1); }
  console.log('ALL_CHECKS_PASS (wsvoid-r45: 12 ข้อ)');
})().catch(e => { console.error('SUITE_CRASH', e); process.exit(2); });
