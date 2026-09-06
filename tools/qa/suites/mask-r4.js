/* ตรวจว่าการปิดบังข้อมูลในคู่มือทำงานจริง — เลขเครื่อง เลขถัง เลขเอกสาร ต้องหายจากจอ */
const { chromium, EXE, BASE } = require('./env');
const path = require('path');
const MASK_FN = require('fs').readFileSync(path.resolve(__dirname, '../../manual/build.js'), 'utf8')
  .match(/const MASK_FN = \(\) => \{[\s\S]*?\n\};/)[0].replace(/^const MASK_FN = \(\) => /, '').replace(/;$/, '');

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const p = await b.newPage({ viewport: { width: 390, height: 900 } });
  const fails = [];
  await p.goto(BASE + '/index.html');
  await p.click('#lgGo'); await p.waitForTimeout(400);

  const PATTERNS = {
    engine: /\b[A-Z0-9]{3,6}E-\d{5,7}\b/,
    frame: /\b(?:MLE|MH3|RLC)[A-Z0-9]{12,16}\b/,
    doc: /\b[A-Z]{3}\d{2}\/(?:REC_P|RMC)\d{6,12}\b/,
    bank: /\b\d{3}-\d-\d{5}-\d\b/,
    ssn: /\b\d{13}\b/
  };

  let sawEngine = 0, sawBank = 0;
  for (const screen of ['recv', 'sell', 'follow', 'reg', 'service', 'users', 'payroll']) {
    await p.evaluate(k => { if (canSee(k)) go(k); }, screen);
    await p.waitForTimeout(400);
    const before = await p.$eval('#app', e => e.innerText);
    await p.evaluate('(function(){' + MASK_FN.replace(/^\{|\}$/g, '') + '})()');
    await p.waitForTimeout(80);
    const after = await p.$eval('#app', e => e.innerText);

    for (const [name, re] of Object.entries(PATTERNS)) {
      const hadIt = re.test(before);
      const stillThere = re.test(after);
      if (hadIt && name === 'engine') sawEngine++;
      if (hadIt && name === 'bank') sawBank++;
      if (hadIt && stillThere) fails.push(`${screen}: ${name} survived masking — ${after.match(re)[0]}`);
    }
    // การปิดบังต้องไม่กลืนทั้งหน้า
    if (after.length < before.length * 0.9) fails.push(`${screen}: masking removed too much text`);
    if (!/[ก-๙]/.test(after)) fails.push(`${screen}: Thai text gone after masking`);
  }

  // ต้องเจอของจริงก่อนปิดบังอย่างน้อยหนึ่งหน้า ไม่งั้นการทดสอบไม่ได้พิสูจน์อะไร
  if (!sawEngine) fails.push('control failed: no engine number was visible on any screen before masking');
  if (!sawBank) fails.push('control failed: no bank account was visible on any screen before masking');

  console.log(fails.length ? 'FAILS:\n' + fails.join('\n') : 'ALL_CHECKS_PASS');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();
