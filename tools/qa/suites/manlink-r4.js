const { chromium, EXE, BASE } = require('./env');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const fails = [];
  for (const [role, id] of Object.entries({ admin:'ST1', manager:'ST2', sales:'ST3', stock:'ST6', acct:'ST7', hr:'ST8', tech:'ST9' })) {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    p.on('pageerror', e => fails.push(`[${role}] PAGEERROR ${e.message}`));
    await p.goto(BASE + '/index.html');
    await p.click(`#lgUsers [data-id="${id}"]`);
    await p.click('#lgGo'); await p.waitForTimeout(400);
    await p.click('#bnav [data-more]'); await p.waitForTimeout(350);
    const links = await p.$$eval('#moreB a.nb', els => els.map(e => ({ href: e.getAttribute('href'), t: e.textContent.trim(), target: e.target })));
    if (links.length !== 2) { fails.push(`[${role}] manual links = ${links.length}`); await p.close(); continue; }
    const mine = links[0].href;
    if (mine !== `docs/manual/famai-${role}.pdf`) fails.push(`[${role}] wrong manual link: ${mine}`);
    if (links[1].href !== 'docs/manual/famai-flow.pdf') fails.push(`[${role}] flow link wrong: ${links[1].href}`);
    if (links.some(l => l.target !== '_blank')) fails.push(`[${role}] manual link does not open in a new tab`);
    for (const l of links) if (!fs.existsSync(require('path').resolve(__dirname, '../../..', l.href))) fails.push(`[${role}] file missing: ${l.href}`);
    // แตะแล้วต้องปิดแผ่น ไม่ใช่เด้ง "ไม่มีสิทธิ์"
    await p.evaluate(() => document.querySelector('#moreB a.nb').removeAttribute('href'));
    await p.click('#moreB a.nb'); await p.waitForTimeout(300);
    if (await p.$eval('#more', e => e.classList.contains('on'))) fails.push(`[${role}] sheet stayed open after tapping the manual link`);
    const toast = await p.$$eval('.toast', e => e.map(x => x.textContent).join('|'));
    if (/ไม่มีสิทธิ์/.test(toast)) fails.push(`[${role}] manual link fired go() and was denied`);
    await p.close();
  }
  console.log(fails.length ? 'FAILS:\n' + fails.join('\n') : 'ALL_CHECKS_PASS');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();
