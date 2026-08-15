const { chromium, EXE, BASE } = require('./env');
(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [];
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.goto(BASE + '/index.html');
  await p.click('#lgGo'); await p.waitForTimeout(400);

  // --- รายงาน ---
  await p.evaluate(() => go('report')); await p.waitForTimeout(300);
  if (!await p.isVisible('#rpFilt')) fails.push('report: ตัวกรอง button hidden at 390');
  if (await p.isVisible('#rpBranch')) fails.push('report: rpBranch still in header at 390');
  // v1.24: ช่วงเวลาย้ายมาเป็นชิปบนหน้า ต้องเห็นตลอดที่ 390 ไม่ต้องเปิดแผ่น
  if (!await p.isVisible('#rpPer [data-pcus]')) fails.push('report: แถบช่วงเวลาไม่โผล่ที่ 390');
  const sum0 = await p.$eval('#rpFsum', e => e.textContent.trim());
  if (!sum0) fails.push('report: summary line empty');
  await p.click('#rpFilt'); await p.waitForTimeout(300);
  if (!await p.$eval('#fsheet', e => e.classList.contains('on'))) fails.push('report: sheet did not open');
  if (!await p.$eval('body', e => e.classList.contains('lock'))) fails.push('report: body.lock missing');
  const inSheet = await p.evaluate(() => !!document.querySelector('#fsBody #rpBranch'));
  if (!inSheet) fails.push('report: rpBranch not moved into sheet');
  // เปลี่ยนสาขาแล้วรายงานต้องวาดใหม่
  const before = await p.$eval('#rpTable', e => e.innerHTML.length);
  await p.evaluate(() => { const s = $('#rpBranch'); if (s.options.length > 1) { s.value = s.options[1].value; s.onchange(); } });
  await p.waitForTimeout(250);
  const sumAfter = await p.$eval('#rpFsum', e => e.textContent);
  await p.click('#fsDone'); await p.waitForTimeout(300);
  if (await p.$eval('#fsheet', e => e.classList.contains('on'))) fails.push('report: sheet did not close');
  if (await p.$eval('body', e => e.classList.contains('lock'))) fails.push('report: body.lock stuck after close');
  const backHome = await p.evaluate(() => { const el = document.querySelector('#rpBranch');
    return !!(el && el.closest('.card') && el.closest('.hd')); });
  if (!backHome) fails.push('report: rpBranch not returned to header');
  const sum1 = await p.$eval('#rpFsum', e => e.textContent.trim());
  if (!sum1 || sum1 === sum0) fails.push(`report: summary did not update (${sum0} -> ${sum1})`);

  // แท็บ monthly: แถวสลับมิติต้องโผล่ · แท็บอื่นต้องซ่อน (v1.24 — วัน/เดือนไม่อยู่ในแผ่นแล้ว)
  await p.evaluate(() => { RP_SEL = 'monthly'; rReport(); }); await p.waitForTimeout(200);
  await p.click('#rpFilt'); await p.waitForTimeout(300);
  const rows = await p.evaluate(() => ({
    dim: getComputedStyle(document.querySelector('#rpDim').closest('.fsrow')).display,
    br: getComputedStyle(document.querySelector('#rpBranch').closest('.fsrow')).display }));
  if (rows.dim === 'none') fails.push('monthly: rpDim row hidden in sheet');
  if (rows.br === 'none') fails.push('monthly: rpBranch row hidden in sheet');
  await p.keyboard.press('Escape'); await p.waitForTimeout(250);

  // ออกจากหน้าไปหน้าอื่นขณะแผ่นเปิด ต้องไม่ทิ้ง control ค้าง
  await p.click('#rpFilt'); await p.waitForTimeout(250);
  await p.evaluate(() => go('dash')); await p.waitForTimeout(250);
  const stranded = await p.evaluate(() => !!document.querySelector('#fsBody .inp'));
  if (stranded) fails.push('control stranded in sheet after navigating away');

  // --- ลูกค้าและดีล (v1.11 รวมตัวกรองของติดตาม/ทะเบียน/ไฟแนนซ์ไว้ชุดเดียว) ---
  for (const [screen, btn, sum, tabIdx] of [['deal', '#dlFilt', '#dlFsum', null]]) {
    await p.evaluate(k => go(k), screen); await p.waitForTimeout(250);
    if (tabIdx != null) { const bs = await p.$$('.screen.on .tabs button'); await bs[tabIdx].click(); await p.waitForTimeout(250); }
    if (!await p.isVisible(btn)) { fails.push(`${screen}: ${btn} not visible`); continue; }
    await p.click(btn); await p.waitForTimeout(300);
    if (!await p.$eval('#fsheet', e => e.classList.contains('on'))) fails.push(`${screen}: sheet did not open`);
    const n = await p.$$eval('#fsBody .fsrow', e => e.length);
    if (!n) fails.push(`${screen}: sheet empty`);
    await p.click('#fsDone'); await p.waitForTimeout(300);
    const s = await p.$eval(sum, e => e.textContent.trim());
    if (!s) fails.push(`${screen}: summary line empty`);
  }

  // เดสก์ท็อป: ต้องไม่มีปุ่มตัวกรอง ตัวกรองอยู่ในหัวการ์ดตามเดิม
  await p.setViewportSize({ width: 1440, height: 900 }); await p.waitForTimeout(400);
  await p.evaluate(() => go('report')); await p.waitForTimeout(300);
  if (await p.isVisible('#rpFilt')) fails.push('desktop: ตัวกรอง button should be hidden');
  if (!await p.isVisible('#rpBranch')) fails.push('desktop: rpBranch should be in header');
  // v1.24: แถบช่วงเวลาอยู่บนหน้าเสมอ ทั้งเดสก์ท็อปและมือถือ
  if (!await p.isVisible('#rpPer [data-pr="7"]')) fails.push('desktop: แถบช่วงเวลาไม่โผล่');

  console.log(fails.length ? 'FAILS:\n' + fails.join('\n') : 'ALL_CHECKS_PASS');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();
