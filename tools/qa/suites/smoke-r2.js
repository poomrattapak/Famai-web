const { chromium, EXE, BASE } = require('./env');

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const fails = [];
  const errors = [];

  // ---------- admin @390 ----------
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await page.goto(BASE + '/index.html');
  await page.click('#lgGo');
  await page.waitForTimeout(300);
  await page.evaluate(() => go('report'));
  await page.waitForTimeout(250);

  // 9 แท็บสำหรับ admin + แถวเดียวเลื่อนได้ที่ 390
  const tabs = await page.$$eval('#rpTabs button', els => els.map(e => e.dataset.rp));
  if (tabs.length !== 9) fails.push('admin tabs = ' + tabs.length + ' expected 9: ' + tabs);
  // v1.4: แท็บต้องพับหลายแถวและห้ามเลื่อนแนวนอน (กลับด้านจากรอบ 2 โดยตั้งใจ)
  const rows = await page.$$eval('#rpTabs button', els => new Set(els.map(e => e.offsetTop)).size);
  if (rows < 2) fails.push(`rpTabs should wrap to multiple rows at 390 (rows=${rows})`);
  const scrolls = await page.$eval('#rpTabs', e => e.scrollWidth > e.clientWidth + 1);
  if (scrolls) fails.push('rpTabs must not scroll horizontally at 390');
  const allVisible = await page.$$eval('#rpTabs button', els =>
    els.every(e => { const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; }));
  if (!allVisible) fails.push('some rpTabs chips fall outside the viewport');

  // เดินทุกแท็บ — KPI 3 ช่อง ไม่มี error
  for (const t of tabs) {
    await page.evaluate(k => { RP_SEL = k; rReport(); }, t);
    await page.waitForTimeout(120);
    const nk = await page.$$eval('#rpKpi .kpi', els => els.length);
    if (nk !== 3) fails.push(`tab ${t}: kpi count ${nk}`);
    // v1.24: ช่วงเวลาเป็นแถบชิปของทุกแท็บ · ตัวสลับมิติโชว์เฉพาะแท็บขายรายเดือน
    const vis = await page.evaluate(() => ({
      per: !!document.querySelector('#rpPer [data-pr]'),
      dim: $('#rpDim').style.display !== 'none',
    }));
    if (!vis.per) fails.push(`tab ${t}: ไม่มีแถบช่วงเวลา`);
    if (t === 'monthly' && !vis.dim) fails.push('monthly: ไม่มีตัวสลับมิติ');
    if (t !== 'monthly' && vis.dim) fails.push(`tab ${t}: ตัวสลับมิติไม่ควรโชว์`);
  }

  // ---------- daily: ยอดตรงค่าที่คำนวณมือ + สูตรอิสระ ----------
  // v1.24: แท็บปิดยอดใช้ช่วงเวลาเดียวกับทุกแท็บ — เลือกชิป "วันนี้" คือใบปิดยอดวันเดียวแบบเดิม
  await page.evaluate(() => { const st = perSt('report'); st.from = ''; st.to = ''; st.r = 1;
    RP_SEL = 'daily'; rReport(); });
  await page.waitForTimeout(150);
  const daily = await page.evaluate(() => {
    const d = rpBuild('daily');
    const kv = d.kpi.map(k => k[1]);
    // สูตรอิสระจาก array ตรง ๆ
    const day = TODAY;
    let inn = 0, out = 0;
    SALES.filter(s => !s.void && s.soldAt === day && inScope(s.branch)).forEach(s => {
      if (s.pay === 'cash') { const ar = AR.find(a => a.saleId === s.id); const amt = s.net - (ar ? ar.due : 0); if (amt > 0) inn += amt; }
      else if (s.down > 0) inn += s.down;
    });
    AR.filter(a => inScope(a.branch)).forEach(a => (a.pays || []).forEach(p => { if (String(p.at).slice(0, 10) === day) inn += p.amt; }));
    PMOVES.filter(m => m.qty < 0 && m.type === 'sale' && inScope(m.branch) && String(m.at).slice(0, 10) === day)
      .forEach(m => { const p = PARTS.find(x => x.id === m.partId); if (p) inn += p.price * -m.qty; });
    SERVICE.filter(v => inScope(v.branch) && String(v.at).slice(0, 10) === day).forEach(v => inn += v.labor + v.parts);
    EXPENSES.filter(e => inScope(e.branch) && String(e.at).slice(0, 10) === day).forEach(e => out += e.amt);
    return { kv, inn, out, rows: d.rows.length };
  });
  if (daily.inn !== 10730) fails.push('daily independent inn = ' + daily.inn + ' expected 10730');
  if (daily.out !== 1200) fails.push('daily independent out = ' + daily.out + ' expected 1200');
  if (!daily.kv[0].includes('10,730')) fails.push('daily KPI in = ' + daily.kv[0]);
  if (!daily.kv[1].includes('1,200')) fails.push('daily KPI out = ' + daily.kv[1]);
  if (!daily.kv[2].includes('9,530')) fails.push('daily KPI net = ' + daily.kv[2]);
  if (!daily.rows) fails.push('daily has no rows');

  // ---------- monthly: สลับ 3 มิติ หัวคอลัมน์แรกเปลี่ยน + ค่าอยู่ข้าม render ----------
  await page.evaluate(() => { RP_SEL = 'monthly'; rReport(); });
  await page.waitForTimeout(120);
  // ที่ 390px รายงานเป็นการ์ด — ตรวจว่าหัวการ์ดเปลี่ยนตามมิติที่เลือกจริง
  for (const [dim, label] of [['model', 'รุ่น'], ['sales', 'เซลล์'], ['branch', 'สาขา']]) {
    const r = await page.evaluate(d => {
      $('#rpDim').value = d; rReport();
      const b = rpBuild('monthly');
      return { head: b.head[0].t, keys: b.rows.map(x => x[0]),
        cards: document.querySelectorAll('#rpTable .crow').length };
    }, dim);
    if (r.head !== label) fails.push(`monthly dim ${dim}: head = ${r.head}`);
    if (!r.keys.length) fails.push(`monthly dim ${dim}: no rows`);
    if (!r.cards) fails.push(`monthly dim ${dim}: no cards rendered at 390`);
    const ok = await page.evaluate(([d, keys]) => keys.every(k =>
      d === 'branch' ? BRANCHES.some(b => b.name === k)
      : d === 'sales' ? SALESPEOPLE.indexOf(k) >= 0
      : UNITS.some(u => u.model === k)), [dim, r.keys]);
    if (!ok) fails.push(`monthly dim ${dim}: keys not from that dimension (${r.keys})`);
  }
  await page.evaluate(() => { RP_SEL = 'sales'; rReport(); RP_SEL = 'monthly'; rReport(); });
  await page.waitForTimeout(120);
  const dimKept = await page.evaluate(() => $('#rpDim').value);
  if (dimKept !== 'branch') fails.push('rpDim value not preserved across tab switch: ' + dimKept);

  // ---------- finsum: เดือนปัจจุบันมีเคสที่ยื่นวันนี้ / ทุกช่วงเวลามี avg + commission ----------
  const finCur = await page.evaluate(() => { RP_SEL = 'finsum'; rReport(); const d = rpBuild('finsum');
    return { rows: d.rows.length, cases: d.kpi[0][1] }; });
  if (!finCur.rows) fails.push('finsum (current month): no rows despite today\'s submission');
  const fin = await page.evaluate(() => { const st = perSt('report'); st.from = ''; st.to = ''; st.r = 365;
    rReport(); const d = rpBuild('finsum');
    return { rows: d.rows, kpi: d.kpi.map(k => k[1]) }; });
  if (!fin.rows.length) fails.push('finsum (all time): no rows');
  const hasAvg = fin.rows.some(r => typeof r[6] === 'number');
  if (!hasAvg) fails.push('finsum: no avg-days computed from any log');
  const hasComm = fin.rows.some(r => r[8] > 0);
  if (!hasComm) fails.push('finsum: no commission > 0');
  await page.evaluate(() => { const st = perSt('report'); st.r = 30; rReport(); });

  // ---------- money: มีแถวงานซ่อม + ขายอะไหล่ ----------
  const money = await page.evaluate(() => { const d = rpBuild('money');
    return { svc: d.rows.filter(r => r[1] === 'งานซ่อม').length, pts: d.rows.filter(r => r[1] === 'ขายอะไหล่').length }; });
  if (!money.svc) fails.push('money: no service rows');
  if (!money.pts) fails.push('money: no parts-sale rows');

  // ---------- print smoke: หัวกระดาษ daily เป็นวันที่ ----------
  await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed = 1; }; RP_SEL = 'daily'; rReport(); });
  await page.waitForTimeout(120);
  await page.click('#rpPrint');
  await page.waitForTimeout(200);
  const pr = await page.evaluate(() => ({ p: window.__printed, txt: $('#printArea').innerHTML }));
  if (!pr.p) fails.push('print not invoked');
  const dayTh = await page.evaluate(() => thDate(TODAY));
  if (!pr.txt.includes(dayTh)) fails.push('daily print subtitle missing day date');

  // ---------- CSV smoke: rpCsv บนแท็บใหม่ทั้ง 3 ----------
  for (const t of ['daily', 'monthly', 'finsum']) {
    await page.evaluate(k => { RP_SEL = k; rReport(); }, t);
    await page.waitForTimeout(100);
    const dl = page.waitForEvent('download', { timeout: 4000 }).catch(() => null);
    await page.click('#rpCsv');
    if (!await dl) fails.push(`rpCsv ${t}: no download`);
  }
  await page.close();

  // ---------- acct @1440: เห็นแท็บใหม่ / stock: ไม่เห็น + เงินเป็น — ----------
  const p2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  p2.on('pageerror', e => errors.push('acct PAGEERROR ' + e.message));
  await p2.goto(BASE + '/index.html');
  await p2.evaluate(() => { const b = [...document.querySelectorAll('.lg-u')].find(x => x.textContent.includes('บัญชี')); b.click(); });
  await p2.click('#lgGo');
  await p2.waitForTimeout(300);
  await p2.evaluate(() => go('report'));
  await p2.waitForTimeout(250);
  const acctTabs = await p2.$$eval('#rpTabs button', els => els.map(e => e.dataset.rp));
  for (const t of ['daily', 'monthly', 'finsum']) if (!acctTabs.includes(t)) fails.push('acct missing tab ' + t);
  for (const t of acctTabs) {
    await p2.evaluate(k => { RP_SEL = k; rReport(); }, t);
    await p2.waitForTimeout(100);
  }
  await p2.close();

  const p3 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  p3.on('pageerror', e => errors.push('stock PAGEERROR ' + e.message));
  await p3.goto(BASE + '/index.html');
  await p3.evaluate(() => { const b = [...document.querySelectorAll('.lg-u')].find(x => x.textContent.includes('สต๊อก')); b.click(); });
  await p3.click('#lgGo');
  await p3.waitForTimeout(300);
  await p3.evaluate(() => go('report'));
  await p3.waitForTimeout(250);
  const stockTabs = await p3.$$eval('#rpTabs button', els => els.map(e => e.dataset.rp));
  if (stockTabs.length !== 2 || stockTabs.includes('daily') || stockTabs.includes('finsum'))
    fails.push('stock tabs wrong: ' + stockTabs);
  const dash = await p3.$$eval('#rpTable tbody td', els => els.some(e => e.textContent === '—'));
  if (!dash) fails.push('stock role: money column not masked');
  await p3.close();

  console.log(fails.length ? 'FAILS:\n' + fails.join('\n') : 'ALL_CHECKS_PASS');
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO_PAGE_ERRORS');
  await browser.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})();
