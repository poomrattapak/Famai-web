const { chromium, EXE, BASE } = require('./env');
(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const fails = [];
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await page.goto(BASE + '/index.html');
  await page.click('#lgGo'); await page.waitForTimeout(300);
  // สายลับชื่อไฟล์: ห่อ csv() เก็บชื่อทุกครั้งที่ถูกเรียก
  await page.evaluate(() => { window.__names = []; const orig = csv;
    window.csv = function (name, head, rows) { window.__names.push(name); return orig(name, head, rows); }; });

  const run = async (screen, btn, expect, label) => {
    await page.evaluate(k => go(k), screen); await page.waitForTimeout(200);
    const files = [];
    const h = d => files.push(1);
    page.on('download', h);
    await page.evaluate(([b]) => { window.__names = []; document.querySelector(b).click(); }, [btn]);
    await page.waitForTimeout(1500);
    page.off('download', h);
    if (files.length !== expect) fails.push(`${label}: ${files.length} downloads expected ${expect}`);
    return page.evaluate(() => window.__names);
  };

  const n1 = await run('service', '#expSv', 1, 'expSv');
  if (!n1.some(n => n.includes('ใบงานซ่อม'))) fails.push('expSv wrong csv name: ' + n1);
  const n2 = await run('parts', '#expParts', 1, 'expParts');
  if (!n2.some(n => n.includes('อะไหล่'))) fails.push('expParts wrong csv name: ' + n2);
  const n3 = await run('expense', '#expExp', 1, 'expExp');
  if (!n3.some(n => n.includes('ค่าใช้จ่าย'))) fails.push('expExp wrong csv name: ' + n3);
  const n4 = await run('expense', '#expBook', 5, 'expBook');
  for (const sfx of ['_ขาย', '_ค่าใช้จ่าย', '_รับเงิน', '_ศูนย์ซ่อม', '_ขายอะไหล่'])
    if (!n4.some(n => n.includes(sfx))) fails.push('expBook missing: ' + sfx + ' in ' + n4);

  // เนื้อไฟล์ _ขายอะไหล่ ต้องมีราคาคูณจำนวนจริง
  const pmRow = await page.evaluate(() => {
    /* v1.24: ชุดส่งบัญชีออกตามช่วงที่เลือกบนหน้า ไม่ใช่ตัวเลือกเดือนแล้ว */
    const pm = PMOVES.filter(x => x.qty < 0 && x.type === 'sale' && inScope(x.branch) && inPer('expense', x.at));
    return pm.map(x => { const p = PARTS.find(y => y.id === x.partId); return p ? p.price * -x.qty : 0; });
  });
  if (!pmRow.length || pmRow.some(v => !(v > 0))) fails.push('parts-sale rows invalid: ' + pmRow);

  console.log(fails.length ? 'FAILS:\n' + fails.join('\n') : 'ALL_CHECKS_PASS');
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO_PAGE_ERRORS');
  await browser.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})();
