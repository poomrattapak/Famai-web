/* ด่าน v1.36 — หน้าใบกำกับภาษี 3 ส่วน + เลขรันร่วม + ใบวางบิล + ย้ายข้ามบริษัท
   เจ้าของสั่ง (บรีฟรอบ 2 ข้อ 12 26-30 + คำตอบข้อ 7): แท็บใบกำกับแยก ลูกค้า/ขายส่ง/อื่นๆ ·
   เลขใบกำกับรันร่วมซีรีส์เดียว (default: ต่อบริษัทต่อปี — ระดับซีรีส์รอเจ้าของยืนยัน) ·
   ใบกำกับตัวรถออกหลังส่งมอบ · กรอกยอดรวม VAT แล้วถอดฐาน/ภาษีให้ · ใบวางบิลต่อบิลขายส่ง ·
   โอนข้ามบริษัท = เปิดบิลขายส่งจากหน้าโอนย้ายได้เลย (ด่านบล็อกโยกเฉย ๆ ยังอยู่)
   ล็อก:
   [1] เมนู invoice + 3 แท็บ · แท็บขายส่งเป็นด่านจริงใน ivTab (ไม่ใช่แค่ซ่อนปุ่ม §9h) ·
       ตารางลูกค้า = เฉพาะการขายที่ส่งมอบแล้ว
   [2] เลขรันร่วม: ปลีก/ขายส่ง/อื่นๆ บริษัทเดียวกัน กินเลขซีรีส์ -TAX- เดียวต่อเนื่องกัน ·
       ใบเสร็จไม่แตะซีรีส์นี้
   [3] ด่านใน printCurrentDoc: ยังไม่ส่งมอบ = ใบกำกับตัวรถออกไม่ได้ · ใบกำกับเงินดาวน์ออกได้
   [4] VAT ย้อนกลับ: กรอกยอดรวมแล้วเห็นฐาน+ภาษีทันที และเลขบนเอกสารตรงกัน
   [5] ด่าน odSave อยู่ในฟังก์ชัน — เซลล์เรียกตรงต้องถูกปฏิเสธ · กรอกไม่ครบไม่ผ่าน
   [6] ใบวางบิล: เลขออกครั้งเดียวต่อบิล · เซลล์เรียกตรงถูกปฏิเสธ
   [7] ข้ามบริษัทหน้าโอนย้าย: กล่องโผล่เมื่อเลือกปลายทางข้ามบริษัท · tSave ยังบล็อก (A3) ·
       tcGo เปิดบิลจริง รถย้ายแบบมีบิลรองรับ · role ไม่มีสิทธิ์ขายส่งเรียกไม่ได้
   [8] B9: โอนย้ายใน seed อยู่บริษัทเดียวกันและรถติดสถานะกำลังย้าย */
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

  /* ---------- [1] โครงหน้า + ด่านแท็บ + ตารางลูกค้า ---------- */
  await login('ST7');                                    /* การเงิน — พิมพ์ได้ แต่ไม่มีสิทธิ์ขายส่ง */
  const g1 = await p.evaluate(() => {
    go('invoice');
    const out = { cur: CUR, menuHas: MENU.some(m => m.k === 'invoice'),
      wsTabHidden: $('#ivTabWs').style.display === 'none', may: canWholesale() };
    ivTab('iv2');                                        /* เรียกตรง — ด่านต้องอยู่ในฟังก์ชัน */
    out.iv2Blocked = IV_SEL !== 'iv2' && !document.querySelector('#iv2').classList.contains('on');
    out.rows = document.querySelectorAll('#ivSales tbody tr').length;
    out.want = SALES.filter(s => !s.void && inScope(s.branch) && regDone(REGS.find(r => r.saleId === s.id))).length;
    out.undelivered = SALES.filter(s => !s.void && inScope(s.branch) && !regDone(REGS.find(r => r.saleId === s.id))).length;
    return out;
  });
  if (g1.cur !== 'invoice' || !g1.menuHas) bad('[1] การเงินเข้าหน้าใบกำกับไม่ได้');
  if (g1.may) bad('[1] seed เปลี่ยน — การเงินมีสิทธิ์ขายส่งแล้ว ด่านแท็บทดสอบไม่ได้');
  if (!g1.wsTabHidden) bad('[1] ไม่มีสิทธิ์ขายส่งแต่แท็บขายส่งยังโชว์');
  if (!g1.iv2Blocked) bad('[1] เรียก ivTab("iv2") ตรง ๆ แล้วแผ่นขายส่งเปิดให้ — ด่าน §9h หลุด');
  if (!g1.want) bad('[1] seed ไม่มีการขายที่ส่งมอบแล้ว');
  else if (g1.rows !== g1.want) bad('[1] ตารางลูกค้าได้ ' + g1.rows + ' แถว ควรเป็น ' + g1.want + ' (เฉพาะส่งมอบแล้ว)');

  /* ---------- [2]+[3]+[4] เลขรันร่วม + ด่านส่งมอบ + VAT ย้อนกลับ ---------- */
  await login('ST1');
  const g2 = await p.evaluate(async () => {
    const tick = () => new Promise(r => setTimeout(r, 450));
    let printed = 0; window.print = () => printed++;
    const out = {};
    go('invoice');
    const inCo1 = s => coOf(s.branch).id === 'CO1';
    /* ปลีก — ส่งมอบแล้ว + การเงินผ่าน */
    const s1 = SALES.find(s => !s.void && inCo1(s) && regDone(REGS.find(r => r.saleId === s.id)));
    if (!s1) return { skip: true };
    s1.finApproval = { status: 'ผ่าน', by: 'QA', at: TODAY, note: '' };
    DOC_SALE = s1.id; DOC_SEL = s1.pay === 'finance' ? 'FINTX' : 'TAXINV';
    printCurrentDoc(); await tick();
    out.no1 = s1.docs[DOC_SEL]; out.p1 = printed;
    /* ใบเสร็จ — ต้องไม่กินซีรีส์ TAX */
    DOC_SEL = 'RECEIPT'; printCurrentDoc(); await tick();
    out.rcptNo = s1.docs.RECEIPT;
    /* ขายส่ง */
    const pt = WS_PARTNERS.find(x => !x.own && x.active);
    const u = UNITS.find(x => x.status === 'available' && x.branch === 'FMG01');
    const w = wsCommit(pt, 'FMG01', '', [{ unitId: u.id, price: 107000 }], 'QA เลขรันร่วม');
    w.finApproval = { status: 'ผ่าน', by: 'QA', at: TODAY, note: '' };
    wsPrint(w.id, true); await tick();
    out.no2 = w.taxNo; out.wsDocNo = w.docNo;
    /* อื่นๆ */
    ivTab('iv3'); rInvoice();
    $('#odName').value = 'บริษัท QA จำกัด'; $('#odItem').value = 'กล่องท้าย + ติดตั้ง';
    $('#odAmt').value = 10700; $('#odAmt').oninput();
    out.vatPrev = $('#odVatPrev').textContent;
    $('#odBranch').value = 'FMG01';
    const od = odSave();
    out.no3 = od && od.no;
    out.odHTML = (function(){ let h = ''; const keep = printHTML;
      window.printHTML = x => h = x; odPrint(od.id); window.printHTML = keep; return h; })();
    /* [3] ด่านส่งมอบ — เคสผ่อนที่ยังไม่ส่งมอบ + การเงินผ่านแล้ว */
    const s2 = SALES.find(s => !s.void && s.pay === 'finance' && !regDone(REGS.find(r => r.saleId === s.id)));
    if (s2) { s2.finApproval = { status: 'ผ่าน', by: 'QA', at: TODAY, note: '' };
      DOC_SALE = s2.id; const pb = printed;
      DOC_SEL = 'FINTX'; printCurrentDoc(); await tick();
      out.gateBlocked = printed === pb && !(s2.docs && s2.docs.FINTX);
      DOC_SEL = 'DOWNTX'; printCurrentDoc(); await tick();
      out.downOk = printed === pb + 1 && /-TAX-/.test(s2.docs.DOWNTX||''); }
    return out;
  });
  if (g2.skip) bad('[2] ไม่มีการขายที่ส่งมอบแล้วของ CO1 ใน seed');
  else {
    const num = x => parseInt(String(x || '').split('-').pop(), 10);
    const pre = x => String(x || '').replace(/\d+$/, '');
    if (!/-TAX-/.test(g2.no1) || !/-TAX-/.test(g2.no2) || !/-TAX-/.test(g2.no3))
      bad('[2] เลขใบกำกับไม่อยู่ซีรีส์ -TAX- (' + [g2.no1, g2.no2, g2.no3] + ')');
    if (pre(g2.no1) !== pre(g2.no2) || pre(g2.no2) !== pre(g2.no3))
      bad('[2] สามส่วนคนละซีรีส์: ' + [g2.no1, g2.no2, g2.no3]);
    if (num(g2.no2) !== num(g2.no1) + 1 || num(g2.no3) !== num(g2.no2) + 1)
      bad('[2] เลขไม่รันต่อเนื่องซีรีส์เดียว: ' + [g2.no1, g2.no2, g2.no3]);
    if (/-TAX-/.test(g2.rcptNo || '')) bad('[2] ใบเสร็จกินเลขซีรีส์ใบกำกับ (' + g2.rcptNo + ')');
    if (/-TAX-/.test(g2.wsDocNo || '')) bad('[2] ใบส่งของขายส่งกินเลขซีรีส์ใบกำกับ (' + g2.wsDocNo + ')');
    if (!g2.gateBlocked) bad('[3] ยังไม่ส่งมอบแต่ใบกำกับตัวรถออกได้ — ด่านหลุด');
    if (!g2.downOk) bad('[3] ใบกำกับเงินดาวน์ก่อนส่งมอบต้องออกได้ (เงินรับมาแล้วจริง)');
    if (g2.vatPrev.indexOf('10,000') < 0 || g2.vatPrev.indexOf('700') < 0)
      bad('[4] พรีวิวถอด VAT ผิด: ' + g2.vatPrev);
    if (g2.odHTML.indexOf('10,000') < 0 || g2.odHTML.indexOf('10,700') < 0)
      bad('[4] เอกสารอื่นๆ ฐาน/ยอดรวมไม่ตรง');
  }

  /* ---------- [5]+[6] ด่านเขียนของ odSave / wsBilling ---------- */
  await login('ST1');
  const pre6 = await p.evaluate(() => {
    const pt = WS_PARTNERS.find(x => !x.own && x.active);
    const u = UNITS.find(x => x.status === 'available' && x.branch === 'FMG01');
    const w = wsCommit(pt, 'FMG01', '', [{ unitId: u.id, price: 50000 }], 'QA ใบวางบิล');
    let h = 0; const keep = printHTML; window.printHTML = () => h++;
    wsBilling(w.id); const no1 = w.billNo;
    wsBilling(w.id); const same = w.billNo === no1 && h === 2;
    window.printHTML = keep;
    return { wid: w.id, no1, same, def: !!(DOC_DEFS.BILLING && DOC_DEFS.BILLING.n === 'ใบวางบิล') };
  });
  if (!pre6.def) bad('[6] DOC_DEFS.BILLING หายไป');
  if (!pre6.no1 || !/BILLING/.test(pre6.no1)) bad('[6] ใบวางบิลไม่ออกเลข (' + pre6.no1 + ')');
  if (!pre6.same) bad('[6] พิมพ์ใบวางบิลซ้ำแล้วเลขเปลี่ยนหรือไม่พิมพ์');
  await login('ST3');                                    /* เซลล์ */
  const g5 = await p.evaluate(() => {
    const n = ODOCS.length;
    /* เซลล์ไม่เห็นหน้า — กรอกช่องให้ครบแล้วยิงฟังก์ชันตรง เพื่อให้ด่านสิทธิ์เป็นตัวเดียวที่กัน */
    $('#odName').value = 'QA เซลล์'; $('#odItem').value = 'ทดสอบสิทธิ์'; $('#odAmt').value = 1070;
    const r1 = odSave();
    /* seed ไม่มีบิลขายส่ง และ login ใหม่ล้าง state — สร้างบิลตรง ๆ ในหน้านี้
       เพื่อให้ด่านสิทธิ์ของ wsBilling เป็นตัวเดียวที่ยืนกัน (ไม่ใช่ "หาบิลไม่เจอ") */
    WSALES.push({ id: 'QAWB', branch: 'FMG01', partnerId: 'x', items: [], total: 0,
      at: TODAY, docNo: 'QA-WSALE-1', finApproval: { status: 'รอตรวจ' } });
    const w = WSALES[WSALES.length - 1];
    let h = 0; const keep = printHTML; window.printHTML = () => h++;
    const r2 = wsBilling('QAWB');
    window.printHTML = keep;
    return { odBlocked: r1 === false && ODOCS.length === n,
      billBlocked: r2 === false && h === 0 && !w.billNo };
  });
  if (!g5.odBlocked) bad('[5] เซลล์เรียก odSave ตรง ๆ ได้ — ด่าน §9b หลุด');
  if (!g5.billBlocked) bad('[6] เซลล์เรียก wsBilling ตรง ๆ ได้ — ด่าน §9b หลุด');
  /* กรอกไม่ครบ (ในบทบาทที่มีสิทธิ์) */
  await login('ST7');
  const g5b = await p.evaluate(() => {
    go('invoice'); ivTab('iv3'); rInvoice();
    $('#odName').value = ''; $('#odItem').value = ''; $('#odAmt').value = '';
    const n = ODOCS.length; const r = odSave();
    return { blocked: r === false && ODOCS.length === n };
  });
  if (!g5b.blocked) bad('[5] กรอกไม่ครบแต่ odSave ผ่าน');

  /* ---------- [7] ข้ามบริษัทหน้าโอนย้าย ---------- */
  await login('ST1');
  const g7 = await p.evaluate(() => {
    go('transfer');
    const u = UNITS.find(x => x.status === 'available' && inScope(x.branch));
    const cross = BRANCHES.find(br => br.active !== false && !sameCo(br.code, u.branch)).code;
    $('#tUnit').value = u.id; $('#tUnit').onchange();
    $('#tTo').value = cross; $('#tTo').onchange();
    const shown = $('#tCross').style.display !== 'none';
    const priced = num($('#tcPrice').value) > 0;
    const nT = TRANSFERS.length, nW = WSALES.length;
    $('#tSave').onclick();
    const blockStays = TRANSFERS.length === nT && !$('#modal').classList.contains('on')
      && u.status === 'available';
    $('#tcPrice').value = 55000;
    $('#tcGo').onclick();
    if ($('#cfmGo')) $('#cfmGo').onclick();
    const w = WSALES[WSALES.length - 1];
    return { shown, priced, blockStays,
      made: WSALES.length === nW + 1,
      moved: u.branch === cross && u.status === 'available',
      fin: w && w.finApproval.status, hasBill: w && !!w.docNo };
  });
  if (!g7.shown) bad('[7] เลือกปลายทางข้ามบริษัทแล้วกล่องเปิดบิลไม่โผล่');
  if (!g7.priced) bad('[7] ราคาตั้งต้นไม่ถูกเติมจากราคาขายส่ง/ราคาปลีก');
  if (!g7.blockStays) bad('[7] tSave ข้ามบริษัทไม่ถูกบล็อกแล้ว — กติกา A3 หลุด');
  if (!g7.made || !g7.hasBill) bad('[7] tcGo ไม่สร้างบิลขายส่ง');
  if (!g7.moved) bad('[7] รถไม่ย้ายเข้าบริษัทปลายทาง (หรือสถานะเพี้ยน)');
  if (g7.fin !== 'รอตรวจ') bad('[7] บิลจากทางลัดไม่เข้าคิวการเงินตรวจ (G1)');
  /* role มี act:transfer แต่ไม่มี act:wholesale — เรียกตรงต้องไม่เกิด */
  await login('ST6');                                    /* สต๊อก */
  const g7b = await p.evaluate(() => {
    go('transfer');
    const u = UNITS.find(x => x.status === 'available' && inScope(x.branch));
    if (!u) return { skip: true };
    const cross = BRANCHES.find(br => br.active !== false && !sameCo(br.code, u.branch)).code;
    /* seed ไม่มีคู่ค้าในเครือของทุกบริษัท — เติมให้ครบก่อน เพื่อให้ด่าน act:wholesale
       เป็นตัวเดียวที่ยืนกัน (ไม่ใช่ "หาคู่ค้าปลายทางไม่เจอ" มากันแทน) */
    WS_PARTNERS.push({ id: 'QAP7', name: 'QA ในเครือ', own: coOf(cross).id, active: true });
    $('#tUnit').value = u.id; $('#tUnit').onchange();
    $('#tTo').value = cross; $('#tTo').onchange();
    $('#tcPrice').value = 50000;
    const nW = WSALES.length;
    $('#tcGo').onclick();
    if ($('#cfmGo')) $('#cfmGo').onclick();
    return { skip: false, blocked: WSALES.length === nW && u.status === 'available' };
  });
  if (!g7b.skip && !g7b.blocked) bad('[7] สต๊อกเปิดบิลขายส่งจากหน้าโอนย้ายได้ — ด่าน act:wholesale หลุด');

  /* ---------- [8] B9 seed ---------- */
  await login('ST1');
  const g8 = await p.evaluate(() => {
    const tr = TRANSFERS.filter(t => t.demo);
    return { n: tr.length,
      sameCoAll: tr.every(t => sameCo(t.from, t.to)),
      unitFlag: tr.every(t => { const u = UNITS.find(x => x.id === t.unitId);
        return u && (t.status === 'รับแล้ว' || u.status === 'in_transfer'); }) };
  });
  if (!g8.n) bad('[8] seed ไม่มีโอนย้ายตัวอย่าง');
  if (!g8.sameCoAll) bad('[8] โอนย้ายใน seed ข้ามบริษัท — ผิดกติกา A3 ที่แอปตัวเองบังคับ');
  if (!g8.unitFlag) bad('[8] รถที่กำลังโอนย้ายใน seed ไม่ติดสถานะ in_transfer');

  await b.close();
  if (errors.length) fails.push(...errors);
  if (fails.length) { console.log('FAILS:'); fails.forEach(f => console.log(f)); process.exit(1); }
  console.log('ALL_CHECKS_PASS (invoice-r36: 8 ข้อ)');
})().catch(e => { console.error('SUITE_CRASH', e); process.exit(2); });
