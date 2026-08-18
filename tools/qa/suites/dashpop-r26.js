/* ด่านของป๊อปอัพเนื้อหาหน้าแรก v1.26 ข้อ 2 — "กดดูข้อมูลได้ ไม่เด้งไปหน้าอื่น"
   กติกา: กดแล้ว CUR ต้องยัง dash · เลขในป๊อปอัพ = สูตรกลางตัวเดียวกับการ์ด (regQueue/arRows/dSales)
   และขยับตามช่วงเวลา · ด่านสิทธิ์อยู่ในฟังก์ชันเนื้อหา เรียกตรงก็ต้องกัน (§9b)
   ทุกข้อพิสูจน์ mutation แล้ว */
const { chromium, EXE, BASE } = require('./env');

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [], errs = [];
  const login = async (pg, id) => { await pg.goto(BASE + '/index.html');
    await pg.click('#lgUsers [data-id="' + id + '"]'); await pg.click('#lgGo'); await pg.waitForTimeout(500); };

  const p = await (await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1280, height: 900 } })).newPage();
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await login(p, 'ST2');

  /* 1 · หัวการ์ดคิว "ดูทั้งหมด" ต้องเปิดป๊อปอัพ ไม่พาไปหน้า deal
     เช็คการมีอยู่ก่อนกด — ถ้าถูกเปลี่ยนกลับเป็น data-go ต้องแดงสะอาด ไม่ใช่ timeout */
  const regBtn = await p.$('#s-dash [data-pop="reg"]');
  if (!regBtn) fails.push('[1] หัวการ์ดคิวไม่มีปุ่ม data-pop="reg" — ถูกเปลี่ยนกลับเป็นลิงก์เด้งหน้า?');
  else {
    await regBtn.click(); await p.waitForTimeout(400);
    const t1 = await p.evaluate(() => ({ cur: CUR, on: $('#drw').classList.contains('on') }));
    if (t1.cur !== 'dash') fails.push('[1] กด "ดูทั้งหมด" แล้วเด้งไปหน้า ' + t1.cur + ' — ต้องเป็นป๊อปอัพบน dash');
    if (!t1.on)            fails.push('[1] กด "ดูทั้งหมด" แล้วป๊อปอัพไม่เปิด');
  }

  /* 6 · แถวในคิวกดแล้วไปดีลของลูกค้าคนนั้นจริง (ทางไปหน้าจริงที่ตั้งใจให้มี) */
  const t6 = await p.evaluate(() => {
    const r = document.querySelector('#drwB [data-dgo]');
    if (!r) return null;
    const want = r.dataset.dgo; r.click();
    return { want, cur: CUR, sel: DEAL_SEL, closed: !$('#drw').classList.contains('on') };
  });
  if (!t6) fails.push('[6] คิวทะเบียนไม่มีแถวที่กดได้เลย');
  else {
    if (t6.cur !== 'deal' || t6.sel !== t6.want) fails.push('[6] กดแถวแล้วไม่เปิดดีลของลูกค้าคนนั้น (CUR=' + t6.cur + ' SEL=' + t6.sel + ')');
    if (!t6.closed) fails.push('[6] ไปหน้าดีลแล้วป๊อปอัพยังค้างอยู่');
  }
  await p.evaluate(() => go('dash')); await p.waitForTimeout(300);

  /* 2 · เลขในป๊อปอัพต้องตรงสูตรกลาง — เงินค้างรับ / ขายได้ / อะไหล่ */
  const t2 = await p.evaluate(() => {
    const out = {};
    dashPop('ar');
    out.arWant = arRows().filter(x => x.left > 0).length;
    out.arTxt = $('#drwB').textContent; closeDrawer();
    dashPop('kpi', 'sold');
    out.soldWant = dSales().length;
    out.soldTitle = $('#drwT').textContent;
    out.soldRows = document.querySelectorAll('#drwB .q').length; closeDrawer();
    dashPop('todo', 'parts');
    out.lpWant = PARTS.filter(pt => inScope(pt.branch) && pt.qty < pt.min).length;
    out.lpTitle = $('#drwT').textContent; closeDrawer();
    return out;
  });
  if (t2.arTxt.indexOf(t2.arWant + ' รายการ') < 0)
    fails.push('[2] ป๊อปอัพเงินค้างรับไม่มีเลข ' + t2.arWant + ' รายการจาก arRows(): "' + t2.arTxt.slice(0, 70) + '"');
  if (t2.soldTitle.indexOf(String(t2.soldWant)) < 0)
    fails.push('[2] หัวป๊อปอัพขายได้ "' + t2.soldTitle + '" ไม่ตรง dSales() = ' + t2.soldWant);
  if (t2.soldRows !== t2.soldWant)
    fails.push('[2] ป๊อปอัพขายได้มี ' + t2.soldRows + ' แถว แต่ dSales() = ' + t2.soldWant);
  if (t2.lpTitle.indexOf(String(t2.lpWant)) < 0)
    fails.push('[2] หัวป๊อปอัพอะไหล่ "' + t2.lpTitle + '" ไม่ตรงสูตรแถว todo = ' + t2.lpWant);

  /* 3 · เปลี่ยนช่วงเวลาแล้วป๊อปอัพต้องขยับตาม — บีบเหลือวันเดียวแล้วจำนวนแถวต้องลด */
  const t3 = await p.evaluate(() => {
    const before = dSales().length;
    perSt('dash').r = 1; perSt('dash').from = ''; perSt('dash').to = ''; rDash();
    dashPop('kpi', 'sold');
    const rows = document.querySelectorAll('#drwB .q').length, want = dSales().length;
    closeDrawer(); perSt('dash').r = 30; rDash();
    return { before, rows, want };
  });
  if (t3.rows !== t3.want) fails.push('[3] เปลี่ยนช่วงเป็น 1 วันแล้วป๊อปอัพมี ' + t3.rows + ' แถว แต่ dSales() = ' + t3.want);
  if (t3.before > 0 && t3.rows >= t3.before) fails.push('[3] บีบช่วงแล้วแถวไม่ลด (' + t3.before + ' → ' + t3.rows + ') — ป๊อปอัพไม่เคารพช่วงเวลา');

  /* ESC ต้องปิดป๊อปอัพ (ของเดิมของ drawer — กันถอยหลัง) */
  const esc = await p.evaluate(() => { dashPop('reg');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return !$('#drw').classList.contains('on'); });
  if (!esc) fails.push('[6] กด ESC แล้วป๊อปอัพไม่ปิด');
  await p.context().close();

  /* 4-5 · เซลล์ (ST3): ไม่มีสิทธิ์ ar เรียกตรงต้องไม่เปิด · กำไรเห็น "—" ไม่มีเลขเงิน */
  const p3 = await (await b.newContext({ timezoneId: 'Asia/Bangkok', viewport: { width: 1280, height: 900 } })).newPage();
  p3.on('pageerror', e => errs.push('PAGEERROR(ST3) ' + e.message));
  await login(p3, 'ST3');
  const t45 = await p3.evaluate(() => {
    const out = { canAr: canSee('ar'), noMoney: noMoney() };
    arDrawer();
    out.arOpened = $('#drw').classList.contains('on'); closeDrawer();
    dashPop('kpi', 'gp');
    out.gpTxt = $('#drwB').textContent; closeDrawer();
    dashPop('kpi', 'stock');
    out.stockTxt = $('#drwB').textContent; closeDrawer();
    return out;
  });
  if (t45.canAr) fails.push('[4] ST3 มีสิทธิ์ ar — เลือกบทบาทผิด ด่านนี้ตรวจไม่ได้');
  else if (t45.arOpened) fails.push('[4] ST3 เรียก arDrawer() ตรง ๆ แล้วป๊อปอัพเปิด — ด่าน canSee หาย');
  if (!t45.noMoney) fails.push('[5] ST3 มีสิทธิ์ money — ด่านนี้ตรวจไม่ได้');
  else {
    if (t45.gpTxt.indexOf('—') < 0 || /\d{1,3}(,\d{3})+/.test(t45.gpTxt))
      fails.push('[5] ป๊อปอัพกำไรของเซลล์ไม่ใช่ "—": "' + t45.gpTxt.slice(0, 60) + '"');
    if (/\d{1,3}(,\d{3})+\s*฿/.test(t45.stockTxt))
      fails.push('[5] ป๊อปอัพสต๊อกของเซลล์มีเลขเงิน: "' + t45.stockTxt.slice(0, 60) + '"');
  }
  await p3.context().close();

  console.log(fails.length ? 'FAILS:\n' + fails.join('\n') : 'ALL_CHECKS_PASS');
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO_PAGE_ERRORS');
  await b.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})();
