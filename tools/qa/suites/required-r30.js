/* ด่านของดอกจันแดง "ช่องนี้จำเป็นต้องกรอก" (v1.30)
   ตรวจสองทางพร้อมกันในรอบเดียว ทีละช่อง:
   ① ดอกจันโผล่จริงบนจอ อยู่ใน label ของช่องนั้น เป็นตัวอักษร * และเป็นสีเน้น (ไม่ใช่สีล้วน)
   ② เคลียร์ช่องนั้นแล้วยิงฟังก์ชันบันทึกจริง ต้องได้ toast แดงที่ข้อความตรงกับด่านของช่องนั้น
   ข้อ ② คือหัวใจ — ถ้าดอกจันขึ้นแต่บันทึกผ่าน ดอกจันกำลังโกหก และคนจะเลิกเชื่อมันทั้งแอป
   (ตรงตามกฎ §9b: ทดสอบสิทธิ์/ด่านด้วยการเรียกตัวบันทึกตรง ๆ ไม่ใช่ดูว่าปุ่มถูกซ่อน)
   ③ ไม่มีดอกจันหลงไปอยู่บนช่องที่ไม่ได้บังคับ (ดอกจันเกิน = ดอกจันโกหกอีกแบบ)
   ④ ทุกชื่อใน REQ ต้องมีเคสในไฟล์นี้ — เพิ่มชื่อลง REQ แล้วไม่เขียนเคส ด่านนี้แดง */
const { chromium, EXE, BASE } = require('./env');

/* ---------- ตัวช่วยเขียนเส้นทาง ---------- */
const wait  = (p, ms) => p.waitForTimeout(ms || 220);
const scr   = k   => async p => { await p.evaluate(kk => go(kk), k); await wait(p, 300); };
const tap   = sel => async p => { await p.click(sel); await wait(p); };
const js    = code => async p => { await p.evaluate(code); await wait(p); };
const seq   = (...fns) => async p => { for (const f of fns) await f(p); };
const cfTab = n => tap('#cfTabs [data-p="cf' + n + '"]');
const hrLeave = tap('#hrTabs [data-p="h2"]');   /* ใบลา + ขอออกนอกสถานที่ อยู่แพนเดียวกัน */

/* หยิบ id ของระเบียนใน seed มาใช้เปิดหน้าต่าง — ต้องเป็นตัวที่ "ทำรายการนั้นได้จริง"
   ไม่ใช่ตัวแรกที่เจอ ไม่งั้นด่านของฟังก์ชันจะเด้งด้วยเหตุผลอื่นก่อนถึงช่องที่เรากำลังตรวจ */
const OPEN = {
  clPrice : js(`(()=>{ const u=UNITS[0]; clearanceModal(u.id); })()`),
  cust    : js(`custModal()`),
  /* v1.32: ฟอร์มบังคับก่อนออกจากขั้นคุยกับลูกค้า — เปิดกับลูกค้าที่ยังไม่มีใบขาย */
  dp      : js(`(()=>{ const c=CUSTOMERS.find(x=>!SALES.some(y=>y.custId===x.id&&!y.void)); dealProceed(c.id); })()`),
  rj      : js(`(()=>{ const c=FINCASES[0]; finRejectModal(c.id); })()`),
  drop    : js(`(()=>{ const s=SALES.find(x=>!x.void && !(AR.find(a=>a.saleId===x.id)||{}).paid); custDropModal(s.id); })()`),
  model   : js(`modelModal()`),
  event   : js(`execEventModal()`)
};

/* ---------- ตารางเคส ----------
   id    = ช่องที่ตรวจ
   open  = พาให้ช่องนั้นโผล่บนจอ
   fill  = ช่องอื่นที่ต้องกรอกให้ถูกก่อน เพื่อให้ด่านที่เด้งเป็นด่านของ "ช่องนี้" จริง ๆ
   save  = ตัวบันทึก (selector = คลิก · อย่างอื่น = โค้ดที่รันในหน้า)
   want  = ข้อความบนหัว toast แดงที่ต้องได้ — ผูกเคสกับด่านตัวจริงทีละตัว ไม่ใช่ "แดงก็พอ"
   inline= ช่องที่ไม่มี label ให้แปะ ดอกจันฝังอยู่ในมาร์กอัปหน้าช่องเลย */
const CASES = [
  /* ---- ก่อนเข้าระบบ ---- */
  { id:'lgEmail', anon:1, open: tap('#lgSwap'), fill:{ lgPw2:'x' },   save:'liveLogin()', want:'กรอกอีเมลและรหัสผ่าน' },
  { id:'lgPw2',   anon:1, open: tap('#lgSwap'), fill:{ lgEmail:'a@b.c' }, save:'liveLogin()', want:'กรอกอีเมลและรหัสผ่าน' },

  /* ---- รับรถเข้าสต๊อก ---- */
  { id:'rEngine', open: scr('recv'), fill:{ rFrame:'MLTEST0000000001' }, save:'saveRecv()', want:'กรอกเลขเครื่องและเลขถัง' },
  { id:'rFrame',  open: scr('recv'), fill:{ rEngine:'E9TEST-000001' },   save:'saveRecv()', want:'กรอกเลขเครื่องและเลขถัง' },

  /* ---- ขาย · เทียบค่างวด · ขายส่ง ---- */
  { id:'sCust',     open: scr('sell'), save:'saveSale(false)', want:'กรอกชื่อลูกค้า' },
  { id:'gxName',    open: seq(scr('sell'), tap('#sFreeAdd')), save:'#gxGo', want:'กรอกชื่อของแถม' },
  { id:'fNet',      open: seq(scr('sell'), tap('#sellTabs [data-p="p2"]')), save:'finComparePrint()', want:'กรอกราคาสุทธิ' },
  /* v1.36: แท็บขายส่งย้ายไปหน้าใบกำกับภาษี */
  { id:'wsPartner', open: seq(scr('invoice'), tap('#ivTabs [data-p="iv2"]')), save:'wsSave()', want:'เลือกบริษัทผู้ซื้อ' },

  /* ---- โอนย้าย · ใบเสนอราคา · เคลียร์สต๊อก ---- */
  { id:'tUnit',   open: scr('transfer'), save:'#tSave', want:'เลือกรถก่อน' },
  { id:'qV1',     open: scr('quote'),    save:'saveQuote()', want:'เลือกรุ่นรถก่อน' },
  { id:'clPrice', open: seq(scr('stock'), OPEN.clPrice), save:'#clGo', want:'กรอกราคาก่อน' },

  /* ---- ลูกค้าและดีล ---- */
  { id:'cmName',   open: seq(scr('deal'), OPEN.cust), save:'#cmGo', want:'กรอกชื่อลูกค้า' },

  /* ---- v1.32 ฟอร์มบังคับก่อนออกจากขั้น "คุยกับลูกค้า" (บรีฟข้อ 7) ----
     fill ช่องอื่นให้ครบก่อน เพื่อให้ด่านที่เด้งเป็นของช่องที่กำลังตรวจจริง ๆ
     dpIntent เป็น select ที่มีค่า "ยังไม่ระบุ" — เคลียร์ = เลือกกลับไปตัวแรก */
  { id:'dpName',   open: seq(scr('deal'), OPEN.dp), fill:{ dpPhone:'081-000-0000', dpAddr:'ที่อยู่ทดสอบ', dpIdNo:'1111111111119', dpIntent:'เงินสด' }, save:'#dpGo', want:'กรอกชื่อ-นามสกุล' },
  { id:'dpPhone',  open: seq(scr('deal'), OPEN.dp), fill:{ dpName:'ทดสอบ ระบบ', dpAddr:'ที่อยู่ทดสอบ', dpIdNo:'1111111111119', dpIntent:'เงินสด' }, save:'#dpGo', want:'กรอกเบอร์โทร' },
  { id:'dpAddr',   open: seq(scr('deal'), OPEN.dp), fill:{ dpName:'ทดสอบ ระบบ', dpPhone:'081-000-0000', dpIdNo:'1111111111119', dpIntent:'เงินสด' }, save:'#dpGo', want:'กรอกที่อยู่' },
  { id:'dpIdNo',   open: seq(scr('deal'), OPEN.dp), fill:{ dpName:'ทดสอบ ระบบ', dpPhone:'081-000-0000', dpAddr:'ที่อยู่ทดสอบ', dpIntent:'เงินสด' }, save:'#dpGo', want:'กรอกเลขบัตรประชาชน' },
  { id:'dpIntent', open: seq(scr('deal'), OPEN.dp), fill:{ dpName:'ทดสอบ ระบบ', dpPhone:'081-000-0000', dpAddr:'ที่อยู่ทดสอบ', dpIdNo:'1111111111119' }, save:'#dpGo', want:'เลือกเงินสดหรือเงินผ่อน' },
  { id:'rjWhy',    open: seq(scr('deal'), OPEN.rj),   save:'#rjGo', want:'เลือกเหตุผลก่อน' },
  { id:'cdDetail', open: seq(scr('deal'), OPEN.drop), save:'#cdGo', want:'เขียนรายละเอียดก่อน' },
  { id:'fapWhy',   open: seq(scr('deal'), tap('#dlTable [data-deal]'), tap('#dlOne [data-fapno]')), save:'#fapGo', want:'บอกเหตุผลก่อน' },
  /* v1.34: ช่องเลขทะเบียนย้ายไปหน้าฝ่ายทะเบียน (รอบถัดไป) — เคสจะกลับมาพร้อมช่องใหม่ */

  /* ---- เงินค้างรับ ---- */
  { id:'arAmt', open: seq(scr('ar'), tap('#arTable [data-ar]')), save:'#arGo', want:'กรอกจำนวนเงินก่อน' },

  /* ---- บริการ · อะไหล่ · ของแถม ---- */
  { id:'svName', open: scr('service'), save:'svSave()', want:'กรอกชื่อลูกค้า' },
  { id:'pCode',  open: seq(scr('parts'), js(`ptTab('pt1')`)), fill:{ pName:'ผ้าเบรกทดสอบ' }, save:'#pSave', want:'กรอกรหัสและชื่ออะไหล่' },
  { id:'pName',  open: seq(scr('parts'), js(`ptTab('pt1')`)), fill:{ pCode:'PART-TST' },      save:'#pSave', want:'กรอกรหัสและชื่ออะไหล่' },
  { id:'msPart', open: seq(scr('parts'), js(`ptTab('pt2')`)), save:'#msSave', want:'เลือกอะไหล่และจำนวน' },
  { id:'msQty',  open: seq(scr('parts'), js(`ptTab('pt2')`)), save:'#msSave', want:'เลือกอะไหล่และจำนวน' },
  { id:'gName',  open: seq(scr('parts'), js(`ptTab('pt3')`)), save:'#gSave', want:'กรอกชื่อของแถม' },
  { id:'geName', open: seq(scr('parts'), js(`ptTab('pt3')`), tap('#gTable [data-ge]')), save:'#geGo', want:'กรอกชื่อของแถม' },

  /* ---- ค่าใช้จ่าย ---- */
  { id:'eAmt',   open: scr('expense'), save:'#eSave', want:'กรอกจำนวนเงิน' },
  { id:'eCat',   open: scr('expense'), fill:{ eAmt:'500' }, save:'#eSave', want:'กรอกหมวดหมู่' },
  { id:'eStaff', open: scr('expense'), fill:{ eAmt:'500', eCat:'ค่าน้ำมัน' }, save:'#eSave', want:'เลือกพนักงานที่เบิก' },
  { id:'eapWhy', open: seq(scr('expense'), tap('#eTable [data-eapno]')), save:'#eapGo', want:'บอกเหตุผลก่อน' },

  /* ---- ลงเวลา · ใบลา · ออกนอกสถานที่ ---- */
  { id:'fxWhy',   open: seq(scr('hr'), js(`attFixModal(STAFF.find(x=>x.id!==ME.id), ATT_DAY)`)), save:'#fxGo', want:'ต้องระบุเหตุผล' },
  { id:'lvFrom',  open: seq(scr('hr'), hrLeave), fill:{ lvTo:'2569-12-31' }, save:'#lvSave', want:'ช่วงวันที่ไม่ถูกต้อง' },
  { id:'lvTo',    open: seq(scr('hr'), hrLeave), fill:{ lvFrom:'2569-12-30' }, save:'#lvSave', want:'ช่วงวันที่ไม่ถูกต้อง' },
  { id:'lvNo',    open: seq(scr('hr'), hrLeave, tap('#lvTable [data-lv][data-ok="0"]')), save:'#lvNoGo', want:'ไม่อนุมัติต้องบอกเหตุผล' },
  { id:'ofDate',  open: seq(scr('hr'), hrLeave), save:'#ofSave', want:'เลือกวันที่ล่วงหน้า' },
  { id:'ofPlace', open: seq(scr('hr'), hrLeave), fill:{ ofDate:'FUTURE' }, save:'#ofSave', want:'บอกสถานที่หรืองานที่ไปทำ' },
  { id:'ofNo',    open: seq(scr('hr'), hrLeave, tap('#ofList [data-of][data-ok="0"]')), save:'#ofNoGo', want:'ไม่อนุมัติต้องบอกเหตุผล' },

  /* ---- ปฏิทิน ---- */
  { id:'hoDate',  open: seq(scr('cal'), js(`(()=>{ CAL_TAB='veh'; rCal(); })()`), tap('#holAdd')), fill:{ hoName:'วันหยุดทดสอบ' }, save:'#hoGo', want:'กรอกวันที่และชื่อวันหยุด' },
  { id:'hoName',  open: seq(scr('cal'), js(`(()=>{ CAL_TAB='veh'; rCal(); })()`), tap('#holAdd')), save:'#hoGo', want:'กรอกวันที่และชื่อวันหยุด' },
  { id:'evTitle', open: seq(scr('cal'), OPEN.event), save:'#evGo', want:'กรอกชื่องานก่อน' },

  /* ---- ตั้งค่า ---- */
  { id:'fcName',   open: seq(scr('settings'), cfTab(3)), save:'#fcSave', want:'กรอกชื่อบริษัท' },
  { id:'feName',   open: seq(scr('settings'), cfTab(3), tap('#fcTable [data-fce]')), save:'#feGo', want:'กรอกชื่อบริษัท' },
  { id:'siName',   open: seq(scr('settings'), cfTab(4)), save:'siteSave()', want:'กรอกชื่อจุด' },
  { id:'ocName',   open: seq(scr('settings'), cfTab(5)), save:'#ocSave', want:'กรอกชื่อบริษัท' },
  { id:'obName',   open: seq(scr('settings'), cfTab(5)), fill:{ obCode:'FMTEST' }, save:'#obSave', want:'กรอกชื่อสาขา' },
  { id:'obCode',   open: seq(scr('settings'), cfTab(5)), fill:{ obName:'สาขาทดสอบ' }, save:'#obSave', want:'รหัสสาขาต้องเป็นอังกฤษ' },
  { id:'oeName',   open: seq(scr('settings'), cfTab(5), tap('#orgList [data-oce]')), save:'#oeGo', want:'กรอกชื่อบริษัท' },
  { id:'beName',   open: seq(scr('settings'), cfTab(5), tap('#orgList [data-obe]')), save:'#beGo', want:'กรอกชื่อสาขา' },
  { id:'wpName',   open: seq(scr('settings'), cfTab(6)), save:'#wpSave', want:'กรอกชื่อบริษัท' },
  { id:'vmCode',   open: seq(scr('settings'), cfTab(2), OPEN.model), fill:{ vmName:'NMAX' }, save:'#vmGo', want:'รหัสรุ่นต้องเป็นตัวอักษร' },
  { id:'vmName',   open: seq(scr('settings'), cfTab(2), OPEN.model), fill:{ vmCode:'BTF400' }, save:'#vmGo', want:'กรอกชื่อโมเดล' },
  { id:'vmColors', open: seq(scr('settings'), cfTab(2), OPEN.model), fill:{ vmCode:'BTF400', vmName:'NMAX' }, save:'#vmGo', want:'ต้องมีอย่างน้อย 1 สี' }
];

/* ---------- ตัวตรวจในหน้า ---------- */
const MARK = `id => {
  const el = document.getElementById(id);
  if (!el) return { st:'NOFIELD' };
  const px = el.previousElementSibling;
  if (px && px.classList.contains('rq'))
    return { st:'inline', txt:px.textContent.trim(), color:getComputedStyle(px).color, w:px.offsetWidth };
  for (let s = px; s; s = s.previousElementSibling) if (s.matches('label.fl')) {
    const m = s.querySelector('.rq');
    return m ? { st:'label', txt:m.textContent.trim(), color:getComputedStyle(m).color, w:m.offsetWidth, lab:s.textContent.trim() }
             : { st:'NOMARK', lab:s.textContent.trim() };
  }
  return { st:'NOLABEL' };
}`;

/* ดอกจันเกิน: ไล่ .rq ทุกตัวบนจอ แล้วหาช่องกรอกตัวถัดไปในกล่องเดียวกัน
   ถ้าช่องนั้นไม่ได้อยู่ใน REQ และไม่ใช่ช่องที่ยกเว้นไว้ = แปะเกิน */
const STRAY = `EXTRA => {
  const out = [];
  document.querySelectorAll('.rq').forEach(m => {
    const lab = m.closest('label.fl');
    let f = null;
    if (lab) { for (let s = lab.nextElementSibling; s; s = s.nextElementSibling)
                 if (s.matches('input,select,textarea')) { f = s; break; } }
    else     { for (let s = m.nextElementSibling; s; s = s.nextElementSibling)
                 if (s.matches('input,select,textarea')) { f = s; break; } }
    if (!f) { out.push('ดอกจันลอย ไม่มีช่องตามหลัง: ' + (lab ? lab.textContent.trim() : m.parentElement.className)); return; }
    const key = f.id || (f.dataset.wci != null ? 'data-wci' : '?');
    if (REQ.indexOf(key) < 0 && EXTRA.indexOf(key) < 0) out.push('ดอกจันเกินที่ช่อง ' + key);
  });
  return out;
}`;

/* โหลดหน้าใหม่ทุกเคส — สถานะสะอาดเสมอ ไม่มีเคสก่อนหน้าทิ้งของค้างไว้ให้เคสถัดไปเขียว/แดงผิด
   ใช้ domcontentloaded ไม่ใช่ load: กล่องทดสอบออกเน็ตไม่ได้ คำขอ Google Fonts จะค้างจนหมดเวลา
   ทั้งที่สคริปต์ของแอปอยู่ในไฟล์เดียวและรันจบตั้งแต่ parse แล้ว */
const open = async p => { await p.goto(BASE + '/index.html', { waitUntil:'domcontentloaded', timeout:20000 });
  await p.waitForFunction(() => typeof REQ !== 'undefined', null, { timeout:8000 }); };

/* เคลียร์ช่องแบบ "เงียบ" ไม่ยิง input/change
   เพราะบางหน้าวาดฟอร์มใหม่ทั้งก้อนเมื่อมี change (rWsSale เติม #wsPartner กลับเป็นตัวแรก ·
   แท็บค่างวดคิด #fNet ใหม่) แล้วช่องที่เพิ่งเคลียร์จะกลับมามีค่าเอง ด่านก็ไม่มีทางเด้ง
   สิ่งที่เรากำลังตรวจคือ "ตอนกดบันทึก ช่องนี้ว่าง" — ไม่ใช่เส้นทางที่พิมพ์จนว่าง */
const CLEAR = `id => { document.getElementById(id).value = ''; }`;

const LASTTOAST = `() => {
  const t = [...document.querySelectorAll('#toasts .toast')].pop();
  return t ? { bad:t.classList.contains('bad'), head:(t.querySelector('b')||{}).textContent||'' } : null;
}`;

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errors = [], proved = [], seenOnly = [];
  const bad = m => fails.push(m);

  const ctx = await b.newContext({ timezoneId:'Asia/Bangkok', viewport:{ width:1440, height:900 } });
  /* เส้นทางเคสที่พังต้องแดงเร็ว ไม่ใช่รอ 30 วิต่อเคส — 49 เคสจะกลายเป็นครึ่งชั่วโมง */
  ctx.setDefaultTimeout(4000);
  ctx.on('page', pg => {
    pg.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
    pg.on('console', m => { const u = (m.location()||{}).url || '';
      if (m.type()==='error' && !/favicon|fonts\.g|gstatic/.test(u) && !/ERR_CONNECTION/.test(m.text()))
        errors.push('CONSOLE ' + m.text()); });
  });
  const p = await ctx.newPage();

  /* ทุกชื่อใน REQ ต้องมีเคส — กันคนเพิ่มชื่อลง REQ แล้วลืมเขียนด่าน */
  await open(p);
  const req = await p.evaluate(() => REQ);
  const covered = CASES.map(c => c.id);
  req.filter(id => covered.indexOf(id) < 0).forEach(id => bad('REQ มี "' + id + '" แต่ไม่มีเคสใน required-r30'));
  covered.filter(id => req.indexOf(id) < 0 && !CASES.find(c => c.id === id).inline)
    .forEach(id => bad('เคส "' + id + '" ไม่ได้อยู่ใน REQ (ถ้าตั้งใจให้ไม่มี label ต้องตั้ง inline:1)'));

  for (const c of CASES) {
    const at = 'ช่อง ' + c.id;
    try {
      await open(p);
      if (!c.anon) { await p.click('#lgGo'); await wait(p, 420); }
      await c.open(p);

      /* ① ดอกจันโผล่จริง */
      const m = await p.evaluate(eval(MARK), c.id);
      if (m.st === 'NOFIELD') { bad(at + ': เปิดหน้าแล้วไม่เจอช่องนี้ (เส้นทางในตารางเคสพัง)'); continue; }
      if (m.st === 'NOMARK')  { bad(at + ': ไม่มีดอกจันในป้าย "' + m.lab + '"'); }
      if (m.st === 'NOLABEL') { bad(at + ': ไม่มีทั้งป้ายและดอกจัน'); }
      if (c.inline && m.st === 'label') bad(at + ': ตั้ง inline:1 ไว้ แต่ดอกจันไปอยู่ใน label');
      if (!c.inline && m.st === 'inline') bad(at + ': มี label อยู่แล้ว ดอกจันควรอยู่ในป้าย ไม่ใช่ลอยหน้าช่อง');
      if (m.txt != null) {
        if (m.txt !== '*') bad(at + ': เครื่องหมายเป็น "' + m.txt + '" ควรเป็น *');
        if (!m.w)          bad(at + ': ดอกจันกว้าง 0px (ถูกซ่อนอยู่)');
        /* ต้องเป็นสีเน้น ไม่ใช่สีตัวอักษรปกติ — แต่ตัวอักษร * เองก็สื่อความหมายได้โดยไม่พึ่งสี */
        const accent = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
        const want = await p.evaluate(a => { const d=document.createElement('span'); d.style.color=a;
          document.body.appendChild(d); const v=getComputedStyle(d).color; d.remove(); return v; }, accent);
        if (m.color !== want) bad(at + ': ดอกจันสี ' + m.color + ' ควรเป็นสีเน้น ' + want);
      }

      /* ③ ไม่มีดอกจันเกิน (ตรวจทุกจอที่เปิดผ่าน) */
      (await p.evaluate(eval(STRAY), ['dlPlate', 'data-wci'])).forEach(s => bad(at + ' [จอนี้]: ' + s));

      /* ② เคลียร์แล้วบันทึกต้องไม่ผ่าน */
      if (!c.save) { seenOnly.push(c.id); continue; }
      const today = await p.evaluate(() => TODAY);
      for (const [k, v] of Object.entries(c.fill || {}))
        await p.evaluate(([kk, vv, td]) => {
          const el = document.getElementById(kk); if (!el) return;
          el.value = vv === 'FUTURE' ? addDays(td, 3) : vv;
          el.dispatchEvent(new Event('input',  { bubbles:true }));
          el.dispatchEvent(new Event('change', { bubbles:true }));
        }, [k, v, today]);
      await p.evaluate(eval(CLEAR), c.id);
      await wait(p, 120);
      await p.evaluate(() => { document.querySelectorAll('#toasts .toast').forEach(t => t.remove()); });

      if (c.save[0] === '#' || c.save[0] === '[') await p.click(c.save);
      else await p.evaluate(c.save);
      await wait(p, 260);

      const t = await p.evaluate(eval(LASTTOAST));
      if (!t)            bad(at + ': เคลียร์แล้วกดบันทึก ไม่มีการเตือนเลย — ด่านไม่ทำงาน');
      else if (!t.bad)   bad(at + ': เคลียร์แล้วกดบันทึก ได้ toast "' + t.head + '" ที่ไม่ใช่โทนผิดพลาด — น่าจะบันทึกผ่านไปแล้ว');
      else if (t.head.indexOf(c.want) < 0)
        bad(at + ': ด่านที่เด้งคือ "' + t.head + '" ไม่ใช่ด่านของช่องนี้ ("' + c.want + '") — เคสตั้งไม่ตรง');
      else proved.push(c.id);
    } catch (e) {
      bad(at + ': เส้นทางเคสพัง — ' + String(e.message || e).split('\n')[0].slice(0, 140));
    }
  }

  await ctx.close();

  /* ไม่ปิดบังของที่ตรวจไม่ครบ — บอกตรง ๆ ว่าช่องไหนดูแค่ตา ยังไม่ได้พิสูจน์ด่าน */
  console.log('พิสูจน์ด่านจริงแล้ว ' + proved.length + '/' + CASES.length + ' ช่อง');
  if (seenOnly.length) console.log('ตรวจแค่ดอกจัน ยังไม่ได้พิสูจน์ด่าน: ' + seenOnly.join(', '));

  console.log(fails.length ? 'FAILS:\n' + [...new Set(fails)].join('\n') : 'ALL_CHECKS_PASS');
  console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})();
